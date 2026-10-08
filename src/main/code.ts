import { animationInfo, type AnimationInfo } from './animation'
import { createBoard, currentBoard, linkOf, listBoards, markGone, markSent, openBoard, seededUnchanged, setImage, syncBoard } from './board'
import {
  EXPORTABLE_TYPES,
  VIDEO_FPS,
  type Animation,
  isStorageKey,
  type ExportableType,
  type LaunchCommand,
  type MainToUi,
  type RpcMethod,
  type RpcMethods,
  type SelectionItem,
  type UiToMain,
} from '../shared/messages'

const THUMBNAIL_PX = 96
// Thumbnails are a convenience; past this many the list shows placeholders.
const MAX_THUMBNAILS = 30
const SELECTION_DEBOUNCE_MS = 150

type ExportableNode = SceneNode & ExportMixin & DimensionAndPositionMixin & { type: ExportableType }

const UI_WIDTH = 360
figma.showUI(__html__, { width: UI_WIDTH, height: 540, themeColors: true })

if (__DEV__) {
  // Spike readout (docs/spikes.md): which editor we run in, and whether the
  // file name and current user are visible to a public plugin.
  console.log('[ogen] editorType=%s file=%s user=%s', figma.editorType, figma.root.name, figma.currentUser?.name ?? null)
}

type Handlers = {
  [M in RpcMethod]: (params: RpcMethods[M]['params']) => Promise<RpcMethods[M]['result']>
}

const handlers: Handlers = {
  // One node per call: the UI uploads each export before asking for the next,
  // so only one full-size image is in memory at a time.
  exportNode: async ({ nodeId, format, scale }) => {
    if (format !== 'PNG' && format !== 'JPG') throw new Error(`unsupported format ${String(format)}`)
    if (scale !== 1 && scale !== 2 && scale !== 3) throw new Error(`unsupported scale ${String(scale)}`)
    const node = await figma.getNodeByIdAsync(nodeId)
    if (!node || node.removed || !('exportAsync' in node)) throw new Error('The layer no longer exists.')
    const bytes = await node.exportAsync({ format, constraint: { type: 'SCALE', value: scale } })
    return { bytes, nodeId, nodeName: node.name, fileName: figma.root.name }
  },
  // Same one-at-a-time rule; a video is far larger than an image.
  exportVideo: async ({ nodeId, format, quality, scale }) => {
    if (format !== 'MP4' && format !== 'WEBM') throw new Error(`unsupported format ${String(format)}`)
    if (quality !== 'LOW' && quality !== 'MEDIUM' && quality !== 'HIGH') throw new Error(`unsupported quality ${String(quality)}`)
    if (scale !== 1 && scale !== 2) throw new Error(`unsupported scale ${String(scale)}`)
    const node = await figma.getNodeByIdAsync(nodeId)
    if (!node || node.removed) throw new Error('The layer no longer exists.')
    if (!isTopLevelFrame(node)) throw new Error('Only a frame placed directly on a page can be exported as video.')
    const settings = { quality, fps: VIDEO_FPS, constraint: { type: 'SCALE', value: scale } } as const
    let bytes: Uint8Array
    try {
      bytes = await node.exportAsync(format === 'MP4' ? { format: 'MP4', ...settings } : { format: 'WEBM', ...settings })
    } catch (err) {
      // Figma rejects a frame with nothing to animate; say that rather than
      // its internal message.
      const detail = err instanceof Error && err.message ? ` (${err.message})` : ''
      throw new Error(`the frame has no animation Figma can render${detail}.`)
    }
    return { bytes, nodeId, nodeName: node.name, fileName: figma.root.name }
  },
  boardsList: () => listBoards(),
  boardCreate: ({ plan }) => createBoard(plan),
  boardSync: ({ pageId, plan }) => syncBoard(pageId, plan),
  boardSetImage: async ({ nodeId, attachmentId, kind, cropped, bytes }) => {
    await setImage(nodeId, attachmentId, kind, cropped, bytes)
    return null
  },
  boardGone: async ({ pageId, plan, banner }) => {
    await markGone(pageId, plan, banner)
    return null
  },
  boardOpen: async ({ pageId, nodeIds }) => {
    await openBoard(pageId, nodeIds)
    return null
  },
  markSent: async ({ nodeIds, label }) => {
    await markSent(nodeIds, label)
    return null
  },
  storageGet: ({ key }) => figma.clientStorage.getAsync(checkKey(key)),
  storageSet: async ({ key, value }) => {
    await figma.clientStorage.setAsync(checkKey(key), value)
    return null
  },
  storageDelete: async ({ key }) => {
    await figma.clientStorage.deleteAsync(checkKey(key))
    return null
  },
}

figma.ui.onmessage = (msg: UiToMain) => {
  switch (msg.type) {
    case 'ready':
      post({ type: 'init', userName: figma.currentUser?.name ?? null, fileName: figma.root.name, command: launchCommand(), board: currentBoard() })
      break
    case 'request-selection':
      publishSelection()
      break
    case 'rpc':
      void runRpc(msg.id, msg.method, msg.params)
      break
    case 'notify':
      figma.notify(msg.message, { error: msg.error })
      break
    case 'resize':
      figma.ui.resize(UI_WIDTH, Math.round(Math.min(Math.max(msg.height, 400), 800)))
      break
    case 'select':
      void selectNode(msg.nodeId)
      break
  }
}

let selectionTimer: number | undefined
const scheduleSelection = () => {
  if (selectionTimer !== undefined) clearTimeout(selectionTimer)
  selectionTimer = setTimeout(publishSelection, SELECTION_DEBOUNCE_MS)
}
figma.on('selectionchange', scheduleSelection)
figma.on('currentpagechange', scheduleSelection)

// selectionGen invalidates thumbnail renders for a superseded selection.
let selectionGen = 0

function publishSelection() {
  const gen = ++selectionGen
  const selection = figma.currentPage.selection
  const nodes = selection.filter(isExportable)
  const frames = new Map<string, AnimationInfo>()
  const items: SelectionItem[] = nodes.map((n) => {
    const t = n.absoluteTransform
    const item: SelectionItem = { id: n.id, name: n.name, type: n.type, width: n.width, height: n.height, x: t[0][2], y: t[1][2] }
    const animation = animationOf(n, frames)
    if (animation) item.animation = animation
    const linked = linkOf(n)
    if (linked) {
      item.link = { postId: linked.link.postId, campaignId: linked.link.campaignId }
      if (linked.nodeId === n.id && seededUnchanged(n, linked.link)) item.seededUnchanged = true
    }
    return item
  })
  post({ type: 'selection', items, skipped: selection.length - nodes.length })
  void renderThumbnails(nodes.slice(0, MAX_THUMBNAILS), gen)
}

async function renderThumbnails(nodes: ExportableNode[], gen: number) {
  for (const node of nodes) {
    if (gen !== selectionGen) return
    try {
      const bytes = await node.exportAsync({
        format: 'PNG',
        constraint: { type: node.width >= node.height ? 'WIDTH' : 'HEIGHT', value: THUMBNAIL_PX },
      })
      if (gen === selectionGen) post({ type: 'thumbnail', id: node.id, bytes })
    } catch {
      // Empty groups and zero-size nodes cannot render; the list shows a placeholder.
    }
  }
}

// animationOf reports the animation a selected node can be sent as. A nested
// node counts only when the animation is inside it; the video is still the
// whole top-level frame. frames caches walks of top-level frames.
function animationOf(node: ExportableNode, frames: Map<string, AnimationInfo>): Animation | undefined {
  const frame = isTopLevelFrame(node) ? node : node.getTopLevelFrame()
  if (!frame) return undefined
  let info = frames.get(frame.id)
  if (!info) {
    info = animationInfo(frame)
    frames.set(frame.id, info)
  }
  if (!info.animated) return undefined
  if (frame !== node && !animationInfo(node).animated) return undefined
  return {
    durationSec: info.durationSec,
    frame: { id: frame.id, name: frame.name, width: frame.width, height: frame.height },
  }
}

function launchCommand(): LaunchCommand {
  return figma.command === 'send' || figma.command === 'boards' ? figma.command : ''
}

function isTopLevelFrame(node: BaseNode): node is FrameNode {
  return node.type === 'FRAME' && node.parent?.type === 'PAGE'
}

async function selectNode(nodeId: string) {
  const node = await figma.getNodeByIdAsync(nodeId)
  if (!node || node.removed || node.type === 'PAGE' || node.type === 'DOCUMENT') return
  // Only on the current page: switching pages from the plugin would surprise.
  let page: BaseNode | null = node.parent
  while (page && page.type !== 'PAGE') page = page.parent
  if (page !== figma.currentPage) return
  figma.currentPage.selection = [node]
  figma.viewport.scrollAndZoomIntoView([node])
}

function isExportable(node: SceneNode): node is ExportableNode {
  return (EXPORTABLE_TYPES as readonly string[]).includes(node.type) && 'exportAsync' in node
}

async function runRpc(id: number, method: RpcMethod, params: unknown) {
  const handler = handlers[method] as ((p: unknown) => Promise<unknown>) | undefined
  try {
    if (!handler) throw new Error(`unknown method ${method}`)
    post({ type: 'rpc-result', id, ok: true, value: await handler(params) })
  } catch (err) {
    post({ type: 'rpc-result', id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}

function checkKey(key: unknown) {
  if (!isStorageKey(key)) throw new Error(`storage key not allowed: ${String(key)}`)
  return key
}

function post(msg: MainToUi) {
  figma.ui.postMessage(msg)
}
