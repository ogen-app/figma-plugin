import { isRecord, toMe, type Me } from './types'

export const PLUGIN_PATH = '/api/plugins/figma'

// Codes the server sends as a bare `{error: "<code>"}` rather than
// `{code, error}`: the entitlement denials rendered by its error handler.
const BARE_CODES = new Set(['entitlement_exceeded', 'feature_not_available'])

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
    readonly retryAfterMs?: number,
    readonly body?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError
}

export interface ApiClientOptions {
  baseUrl: string
  getToken: () => string | null
  // Called when an authenticated request comes back 401: the token was
  // revoked, the membership removed or the workspace suspended.
  onUnauthorized?: (err: ApiError) => void
  fetchImpl?: typeof fetch
}

export interface RequestOptions {
  body?: BodyInit | object
  auth?: boolean
  signal?: AbortSignal
}

export interface ApiResponse<T = unknown> {
  status: number
  data: T
}

export type ApiClient = ReturnType<typeof createApiClient>

export function createApiClient(opts: ApiClientOptions) {
  const doFetch = opts.fetchImpl ?? ((input, init) => fetch(input, init))

  async function request(method: string, path: string, ro: RequestOptions = {}): Promise<ApiResponse> {
    const auth = ro.auth ?? true
    const headers: Record<string, string> = {}
    let body: BodyInit | undefined
    if (ro.body instanceof FormData || ro.body instanceof Blob || typeof ro.body === 'string') {
      body = ro.body
    } else if (ro.body !== undefined) {
      body = JSON.stringify(ro.body)
      headers['Content-Type'] = 'application/json'
    }
    if (auth) {
      const token = opts.getToken()
      if (!token) throw unauthorized(new ApiError(401, 'plugin_token_invalid', 'not connected'))
      headers.Authorization = `Bearer ${token}`
    }

    let res: Response
    try {
      res = await doFetch(opts.baseUrl + PLUGIN_PATH + path, { method, headers, body, signal: ro.signal })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      throw new ApiError(0, 'network_error', 'Could not reach Ogen. Check your connection.')
    }

    if (res.ok) {
      const data = res.status === 204 ? null : await res.json().catch(() => null)
      return { status: res.status, data }
    }
    const err = await toApiError(res)
    throw auth && err.status === 401 ? unauthorized(err) : err
  }

  function unauthorized(err: ApiError) {
    opts.onUnauthorized?.(err)
    return err
  }

  // putObject uploads bytes to a presigned storage URL. It goes straight to
  // object storage, so it carries no Ogen token and its errors have no code.
  async function putObject(url: string, body: Blob, signal?: AbortSignal): Promise<void> {
    let res: Response
    try {
      res = await doFetch(url, { method: 'PUT', headers: { 'Content-Type': body.type }, body, signal })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      throw new ApiError(0, 'storage_network_error', 'Could not reach Ogen storage. Check your connection.')
    }
    // A storage 4xx (expired URL, bad signature) is not an Ogen auth or plan
    // answer: report it as a plain 400 so the queue doesn't disconnect or
    // stop on it. 5xx stays retryable.
    if (!res.ok) throw new ApiError(res.status >= 500 ? res.status : 400, 'upload_failed', `Upload to storage failed (HTTP ${res.status}).`)
  }

  return {
    request,
    putObject,

    async me(signal?: AbortSignal): Promise<Me> {
      const { data } = await request('GET', '/me', { signal })
      return toMe(data)
    },

    async revokeToken(): Promise<void> {
      await request('DELETE', '/token')
    },
  }
}

export async function toApiError(res: Response): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => null)
  const o = isRecord(body) ? body : {}
  const error = typeof o.error === 'string' ? o.error : undefined
  let code: string | undefined
  if (typeof o.code === 'string') code = o.code
  else if (error && BARE_CODES.has(error)) code = error
  const message = error && error !== code ? error : `Request failed (HTTP ${res.status})`
  return new ApiError(res.status, code, message, parseRetryAfter(res.headers.get('Retry-After')), body)
}

// parseRetryAfter reads delay-seconds or an HTTP date into milliseconds.
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(value)
  return Number.isNaN(date) ? undefined : Math.max(0, date - now)
}
