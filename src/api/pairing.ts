import { sleep as defaultSleep } from '../queue/sleep'
import { isApiError, type ApiClient } from './client'
import { num, parseSession, rec, str, type StoredSession } from './types'

// Read/write-key pairing (CON-338 §5.1). The plugin keeps the read key and
// polls with it; the write key travels to the browser in approve_url.

export interface PairingStart {
  read_key: string
  write_key: string
  approve_url: string
  expires_at: string
  poll_interval_ms: number
}

export type PollResult = { status: 'pending' } | { status: 'approved'; session: StoredSession }

export type PairingOutcome =
  | { kind: 'approved'; session: StoredSession }
  | { kind: 'denied' }
  | { kind: 'expired' }
  | { kind: 'cancelled' }

const PAIRING_TTL_MS = 10 * 60 * 1000
const DEFAULT_POLL_MS = 2000
const MAX_LABEL = 80

export function toPairingStart(v: unknown): PairingStart {
  const o = rec(v)
  return {
    read_key: str(o.read_key),
    write_key: str(o.write_key),
    approve_url: str(o.approve_url),
    expires_at: str(o.expires_at),
    poll_interval_ms: num(o.poll_interval_ms, DEFAULT_POLL_MS),
  }
}

// clientLabel names this install on the approval page, e.g. "Figma · Jane".
export function clientLabel(userName: string | null): string {
  const name = userName?.trim()
  const label = name ? `Figma · ${name}` : 'Figma'
  return Array.from(label).slice(0, MAX_LABEL).join('')
}

export async function startPairing(api: ApiClient, label: string): Promise<PairingStart> {
  const { data } = await api.request('POST', '/pairings', { body: { client_label: label }, auth: false })
  const start = toPairingStart(data)
  if (!start.read_key || !isHttpUrl(start.approve_url)) throw new Error('Ogen returned an unexpected pairing response.')
  return start
}

export async function pollPairing(api: ApiClient, readKey: string, signal?: AbortSignal): Promise<PollResult> {
  const { status, data } = await api.request('GET', `/pairings/${encodeURIComponent(readKey)}`, { auth: false, signal })
  if (status === 202) return { status: 'pending' }
  const session = parseSession(data)
  if (!session) throw new Error('Ogen returned an unexpected token.')
  return { status: 'approved', session }
}

export interface WaitOptions {
  signal: AbortSignal
  now?: () => number
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>
}

// waitForApproval polls until the pairing is approved, denied or expired, or
// the signal aborts. Transient failures (network, 5xx, 429) keep polling.
export async function waitForApproval(api: ApiClient, start: PairingStart, opts: WaitOptions): Promise<PairingOutcome> {
  const now = opts.now ?? Date.now
  const sleep = opts.sleep ?? defaultSleep
  const parsed = Date.parse(start.expires_at)
  const deadline = Number.isNaN(parsed) ? now() + PAIRING_TTL_MS : parsed
  const interval = Math.min(Math.max(start.poll_interval_ms, 1000), 10_000)

  let wait = interval
  for (;;) {
    try {
      await sleep(wait, opts.signal)
    } catch {
      return { kind: 'cancelled' }
    }
    if (opts.signal.aborted) return { kind: 'cancelled' }
    if (now() >= deadline) return { kind: 'expired' }
    wait = interval
    try {
      const res = await pollPairing(api, start.read_key, opts.signal)
      if (res.status === 'approved') return { kind: 'approved', session: res.session }
    } catch (err) {
      if (opts.signal.aborted) return { kind: 'cancelled' }
      if (!isApiError(err)) throw err
      if (err.status === 403) return { kind: 'denied' }
      if (err.status === 410) return { kind: 'expired' }
      if (err.status === 429 && err.retryAfterMs) wait = Math.max(err.retryAfterMs, interval)
      else if (err.status !== 0 && err.status < 500 && err.status !== 429) throw err
    }
  }
}

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}
