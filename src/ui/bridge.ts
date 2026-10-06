import type { MainToUi, RpcMethod, RpcMethods, UiToMain } from '../shared/messages'

export interface Bridge {
  call<M extends RpcMethod>(method: M, params: RpcMethods[M]['params']): Promise<RpcMethods[M]['result']>
  send(msg: UiToMain): void
  subscribe(listener: (msg: MainToUi) => void): () => void
}

type MessageTarget = Pick<Window, 'addEventListener'>

// createBridge wires the UI to the main sandbox. Figma delivers main's
// messages as `event.data.pluginMessage`; the UI posts back to its parent.
export function createBridge(
  target: MessageTarget = window,
  postToMain: (msg: UiToMain) => void = (msg) => parent.postMessage({ pluginMessage: msg }, '*'),
): Bridge {
  let nextId = 1
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  const listeners = new Set<(msg: MainToUi) => void>()

  target.addEventListener('message', (event: MessageEvent) => {
    const msg: unknown = (event.data as { pluginMessage?: unknown } | null)?.pluginMessage
    if (!msg || typeof msg !== 'object' || !('type' in msg)) return
    const typed = msg as MainToUi
    if (typed.type === 'rpc-result') {
      const call = pending.get(typed.id)
      if (!call) return
      pending.delete(typed.id)
      if (typed.ok) call.resolve(typed.value)
      else call.reject(new Error(typed.error))
      return
    }
    for (const listener of listeners) listener(typed)
  })

  return {
    call(method, params) {
      const id = nextId++
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
        postToMain({ type: 'rpc', id, method, params })
      })
    },
    send: postToMain,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
