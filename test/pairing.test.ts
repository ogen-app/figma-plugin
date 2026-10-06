import { describe, expect, it } from 'vitest'
import { createApiClient } from '../src/api/client'
import { clientLabel, startPairing, waitForApproval, type PairingStart } from '../src/api/pairing'
import { fakeFetch, json } from './helpers'

const START: PairingStart = {
  read_key: 'rk',
  write_key: 'wk',
  approve_url: 'https://app.getogen.com/integrations/figma/connect?key=wk',
  expires_at: new Date(60_000).toISOString(),
  poll_interval_ms: 2000,
}

const APPROVED = { token: 'ogp_tok', workspace: { id: 'w', name: 'Acme' }, user: { id: 'u', name: 'Jane', email: 'j@x' } }

// A virtual clock: sleep advances time instead of waiting.
function clock(start = 0) {
  let t = start
  const sleeps: number[] = []
  return {
    now: () => t,
    sleep: async (ms: number, signal: AbortSignal) => {
      if (signal.aborted) throw signal.reason
      sleeps.push(ms)
      t += ms
    },
    sleeps,
  }
}

function api(f: ReturnType<typeof fakeFetch>) {
  return createApiClient({ baseUrl: 'http://api.test', getToken: () => null, fetchImpl: f.fetch })
}

describe('clientLabel', () => {
  it('names the install after the Figma user', () => {
    expect(clientLabel('Jane Doe')).toBe('Figma · Jane Doe')
    expect(clientLabel(null)).toBe('Figma')
    expect(clientLabel('  ')).toBe('Figma')
    expect(Array.from(clientLabel('é'.repeat(200)))).toHaveLength(80)
  })
})

describe('startPairing', () => {
  it('posts the label without a token', async () => {
    const f = fakeFetch(json(201, START))
    const start = await startPairing(api(f), 'Figma · Jane')
    expect(start).toEqual(START)
    expect(f.calls[0]!.url).toBe('http://api.test/api/plugins/figma/pairings')
    expect(f.calls[0]!.init.body).toBe('{"client_label":"Figma · Jane"}')
    expect((f.calls[0]!.init.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('rejects a response without a usable approve_url', async () => {
    const f = fakeFetch(json(201, { ...START, approve_url: 'javascript:alert(1)' }))
    await expect(startPairing(api(f), 'Figma')).rejects.toThrow(/unexpected pairing response/)
  })
})

describe('waitForApproval', () => {
  it('polls until approved and returns the session', async () => {
    const f = fakeFetch(json(202, { status: 'pending' }), json(202, { status: 'pending' }), json(200, APPROVED))
    const c = clock()
    const out = await waitForApproval(api(f), START, { signal: new AbortController().signal, ...c })
    expect(out).toEqual({ kind: 'approved', session: APPROVED })
    expect(c.sleeps).toEqual([2000, 2000, 2000])
    expect(f.calls[0]!.url).toBe('http://api.test/api/plugins/figma/pairings/rk')
  })

  it.each([
    [403, { code: 'pairing_denied' }, 'denied'],
    [410, { code: 'pairing_expired' }, 'expired'],
  ])('maps %i to %s', async (status, body, kind) => {
    const f = fakeFetch(json(status, body))
    const out = await waitForApproval(api(f), START, { signal: new AbortController().signal, ...clock() })
    expect(out.kind).toBe(kind)
  })

  it('stops at expires_at without another poll', async () => {
    const f = fakeFetch(...Array.from({ length: 29 }, () => json(202, { status: 'pending' })))
    const out = await waitForApproval(api(f), START, { signal: new AbortController().signal, ...clock() })
    expect(out.kind).toBe('expired')
    expect(f.calls).toHaveLength(29)
  })

  it('keeps polling through network errors, 5xx and 429', async () => {
    const f = fakeFetch(
      new TypeError('offline'),
      json(503, { error: 'unavailable' }),
      json(429, { error: 'slow' }, { 'Retry-After': '5' }),
      json(200, APPROVED),
    )
    const c = clock()
    const out = await waitForApproval(api(f), START, { signal: new AbortController().signal, ...c })
    expect(out.kind).toBe('approved')
    expect(c.sleeps).toEqual([2000, 2000, 2000, 5000])
  })

  it('returns cancelled once aborted', async () => {
    const ctrl = new AbortController()
    const f = fakeFetch(() => {
      ctrl.abort()
      return json(202, { status: 'pending' })
    })
    const out = await waitForApproval(api(f), START, { signal: ctrl.signal, ...clock() })
    expect(out.kind).toBe('cancelled')
  })
})
