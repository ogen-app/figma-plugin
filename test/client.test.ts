import { describe, expect, it, vi } from 'vitest'
import { ApiError, createApiClient, parseRetryAfter } from '../src/api/client'
import { fakeFetch, json } from './helpers'

function client(f: ReturnType<typeof fakeFetch>, token: string | null = 'ogp_t') {
  const onUnauthorized = vi.fn()
  const api = createApiClient({ baseUrl: 'http://api.test', getToken: () => token, onUnauthorized, fetchImpl: f.fetch })
  return { api, onUnauthorized }
}

describe('api client', () => {
  it('sends the bearer token and normalizes /me', async () => {
    const f = fakeFetch(json(200, { workspace: { id: 'w', name: 'Acme' }, user: { id: 'u', name: 'Jane' }, limits: {} }))
    const { api } = client(f)
    const me = await api.me()
    expect(f.calls[0]!.url).toBe('http://api.test/api/plugins/figma/me')
    expect((f.calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer ogp_t')
    expect(me.workspace.name).toBe('Acme')
    expect(me.limits).toEqual({ max_image_bytes: 52428800, max_image_pixels: 100_000_000 })
  })

  it('reports 401 to onUnauthorized', async () => {
    const f = fakeFetch(json(401, { code: 'plugin_token_invalid', error: 'revoked' }))
    const { api, onUnauthorized } = client(f)
    await expect(api.me()).rejects.toMatchObject({ status: 401, code: 'plugin_token_invalid' })
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('treats a missing token as unauthorized without calling the API', async () => {
    const f = fakeFetch()
    const { api, onUnauthorized } = client(f, null)
    await expect(api.me()).rejects.toBeInstanceOf(ApiError)
    expect(f.calls).toHaveLength(0)
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('reads coded, bare-coded and uncoded error bodies', async () => {
    const f = fakeFetch(
      json(415, { code: 'vector_rejected', error: 'SVG is not supported' }),
      json(402, { error: 'entitlement_exceeded', feature: 'content_bank_assets', limit: 100, current: 100 }),
      json(400, { error: 'file is required' }),
      new Response('<html>bad gateway</html>', { status: 502 }),
    )
    const { api } = client(f)
    const errs: ApiError[] = []
    for (let i = 0; i < 4; i++) errs.push(await api.request('GET', '/x').catch((e: ApiError) => e) as ApiError)
    expect(errs.map((e) => [e.status, e.code, e.message])).toEqual([
      [415, 'vector_rejected', 'SVG is not supported'],
      [402, 'entitlement_exceeded', 'Request failed (HTTP 402)'],
      [400, undefined, 'file is required'],
      [502, undefined, 'Request failed (HTTP 502)'],
    ])
  })

  it('turns a fetch failure into a network_error', async () => {
    const f = fakeFetch(new TypeError('Failed to fetch'))
    const { api } = client(f)
    await expect(api.me()).rejects.toMatchObject({ status: 0, code: 'network_error' })
  })

  it('carries Retry-After on 429', async () => {
    const f = fakeFetch(json(429, { error: 'slow down' }, { 'Retry-After': '3' }))
    const { api } = client(f)
    await expect(api.me()).rejects.toMatchObject({ status: 429, retryAfterMs: 3000 })
  })
})

describe('parseRetryAfter', () => {
  it('reads seconds and HTTP dates', () => {
    expect(parseRetryAfter('2')).toBe(2000)
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6000)
    expect(parseRetryAfter(null)).toBeUndefined()
    expect(parseRetryAfter('soon')).toBeUndefined()
  })
})
