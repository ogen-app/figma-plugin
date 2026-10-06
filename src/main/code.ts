import { isStorageKey, type MainToUi, type RpcMethod, type RpcMethods, type UiToMain } from '../shared/messages'

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
    case 'rpc':
      void runRpc(msg.id, msg.method, msg.params)
      break
    case 'notify':
      figma.notify(msg.message, { error: msg.error })
      break
  }
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
