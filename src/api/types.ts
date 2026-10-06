// Response shapes of the Ogen plugin API (CON-338 §7.1) and guards that turn
// untrusted JSON into them. Guards fill missing fields with safe defaults
// rather than throwing, so a partial response degrades instead of crashing.

export interface Workspace {
  id: string
  name: string
}

export interface User {
  id: string
  name: string
  email?: string
}

export interface Connection {
  id: string
  label: string
  created_at: string
}

export interface Limits {
  max_image_bytes: number
  // Not in the API yet; image-service rejects images above 100 MP.
  max_image_pixels: number
}

export interface Me {
  workspace: Workspace
  user: User
  connection: Connection
  limits: Limits
}

export const DEFAULT_LIMITS: Limits = {
  max_image_bytes: 50 * 1024 * 1024,
  max_image_pixels: 100_000_000,
}

type Json = Record<string, unknown>

export function isRecord(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

export function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

export function rec(v: unknown): Json {
  return isRecord(v) ? v : {}
}

export function toWorkspace(v: unknown): Workspace {
  const o = rec(v)
  return { id: str(o.id), name: str(o.name) }
}

export function toUser(v: unknown): User {
  const o = rec(v)
  const user: User = { id: str(o.id), name: str(o.name) }
  if (typeof o.email === 'string') user.email = o.email
  return user
}

// StoredSession is what pairing yields; the plugin keeps it in clientStorage.
export interface StoredSession {
  token: string
  workspace: Workspace
  user: User
}

export function parseSession(v: unknown): StoredSession | null {
  const o = rec(v)
  const token = str(o.token)
  if (!token.startsWith('ogp_')) return null
  return { token, workspace: toWorkspace(o.workspace), user: toUser(o.user) }
}

export function toMe(v: unknown): Me {
  const o = rec(v)
  const conn = rec(o.connection)
  const limits = rec(o.limits)
  return {
    workspace: toWorkspace(o.workspace),
    user: toUser(o.user),
    connection: { id: str(conn.id), label: str(conn.label), created_at: str(conn.created_at) },
    limits: {
      max_image_bytes: num(limits.max_image_bytes, DEFAULT_LIMITS.max_image_bytes),
      max_image_pixels: num(limits.max_image_pixels, DEFAULT_LIMITS.max_image_pixels),
    },
  }
}
