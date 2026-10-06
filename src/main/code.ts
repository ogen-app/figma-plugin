import {
  EXPORTABLE_TYPES,
  isStorageKey,
  type ExportableType,
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

figma.showUI(__html__, { width: 360, height: 540, themeColors: true })

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
      post({ type: 'init', userName: figma.currentUser?.name ?? null, fileName: figma.root.name })
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
  const items: SelectionItem[] = nodes.map((n) => ({
    id: n.id,
    name: n.name,
    type: n.type,
    width: n.width,
    height: n.height,
  }))
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
