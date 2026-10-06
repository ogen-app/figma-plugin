import { describe, expect, it } from 'vitest'
import type { MainToUi, UiToMain } from '../src/shared/messages'
import { createBridge } from '../src/ui/bridge'

function harness() {
  const target = new EventTarget()
  const sent: UiToMain[] = []
  const bridge = createBridge(target as unknown as Window, (msg) => sent.push(msg))
  const deliver = (msg: MainToUi) =>
    target.dispatchEvent(new MessageEvent('message', { data: { pluginMessage: msg } }))
  return { bridge, sent, deliver }
}

describe('bridge', () => {
  it('resolves an rpc with the matching result', async () => {
    const { bridge, sent, deliver } = harness()
    const p = bridge.call('storageGet', { key: 'ogen' })
    const req = sent[0]
    expect(req).toMatchObject({ type: 'rpc', method: 'storageGet', params: { key: 'ogen' } })
    deliver({ type: 'rpc-result', id: (req as { id: number }).id, ok: true, value: { token: 'x' } })
    await expect(p).resolves.toEqual({ token: 'x' })
  })

  it('rejects an rpc that failed in main', async () => {
    const { bridge, sent, deliver } = harness()
    const p = bridge.call('storageDelete', { key: 'ogen' })
    deliver({ type: 'rpc-result', id: (sent[0] as { id: number }).id, ok: false, error: 'boom' })
    await expect(p).rejects.toThrow('boom')
  })

  it('passes events to subscribers and ignores foreign messages', () => {
    const { bridge, deliver } = harness()
    const got: MainToUi[] = []
    const unsubscribe = bridge.subscribe((m) => got.push(m))
    deliver({ type: 'init', userName: 'Jane', fileName: 'Brand' })
    unsubscribe()
    deliver({ type: 'init', userName: null, fileName: 'x' })
    expect(got).toEqual([{ type: 'init', userName: 'Jane', fileName: 'Brand' }])
  })
})
