import { vi } from 'vitest'

export interface Call {
  url: string
  init: RequestInit
}

// fakeFetch answers requests from a queue of responses and records them.
export function fakeFetch(...responses: Array<Response | Error | (() => Response | Error)>) {
  const calls: Call[] = []
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const next = responses.shift()
    if (!next) throw new Error(`unexpected request ${String(url)}`)
    const r = typeof next === 'function' ? next() : next
    if (r instanceof Error) throw r
    return r
  })
  return { fetch: fn as unknown as typeof fetch, calls }
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}
