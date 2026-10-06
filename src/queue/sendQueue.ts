import { isApiError } from '../api/client'
import type { ImageResult, ImageUpload } from '../api/images'
import type { Limits } from '../api/types'
import type { ExportedImage, ExportFormat, Scale, SelectionItem } from '../shared/messages'
import { bytesWarning } from './preflight'
import { codeMessage, errorMessage, upgradeHint } from './errors'
import type { SendRequest } from './types'

export type ItemStatus =
  | { state: 'queued' }
  | { state: 'exporting' }
  | { state: 'uploading' }
  | { state: 'waiting'; untilMs: number }
  | { state: 'sent'; result: ImageResult; attachMessage?: string }
  | { state: 'failed'; code?: string; message: string }
  | { state: 'skipped'; message: string }

export type QueueOutcome =
  | { kind: 'done' }
  | { kind: 'cancelled' }
  | { kind: 'unauthorized' }
  // A plan limit stopped the queue; later items were not tried.
  | { kind: 'quota'; message: string; hint: { text: string; url?: string } }

export interface QueueDeps {
  exportNode: (item: SelectionItem, format: ExportFormat, scale: Scale) => Promise<ExportedImage>
  upload: (input: ImageUpload, signal: AbortSignal) => Promise<ImageResult>
  sleep: (ms: number, signal: AbortSignal) => Promise<void>
  now?: () => number
  limits: Limits
}

export type OnUpdate = (index: number, status: ItemStatus) => void

// Without a Retry-After the server's per-token window is a minute; wait a
// fraction of it rather than hammering.
const DEFAULT_RETRY_AFTER_MS = 5000
const MAX_RATE_LIMIT_WAITS = 5
const TRANSIENT_RETRY_DELAY_MS = 1000

// runSendQueue exports and uploads each item in order, one at a time, and
// reports every status change through onUpdate. Per-item rejects (bad image,
// too large, failed attach) don't stop the queue; a 401 or a plan limit does.
export async function runSendQueue(
  request: SendRequest,
  deps: QueueDeps,
  onUpdate: OnUpdate,
  signal: AbortSignal,
): Promise<QueueOutcome> {
  const now = deps.now ?? Date.now
  const postId = request.destination.kind === 'post' ? request.destination.post.id : undefined
  const skipRest = (from: number, message: string) => {
    for (let j = from; j < request.items.length; j++) onUpdate(j, { state: 'skipped', message })
  }

  for (let i = 0; i < request.items.length; i++) {
    const item = request.items[i]!
    if (signal.aborted) {
      skipRest(i, 'Cancelled.')
      return { kind: 'cancelled' }
    }

    onUpdate(i, { state: 'exporting' })
    let exported: ExportedImage
    try {
      exported = await deps.exportNode(item, request.format, request.scale)
    } catch (err) {
      onUpdate(i, { state: 'failed', message: `Figma could not export this layer: ${errorMessage(err)}` })
      continue
    }
    const tooBig = bytesWarning(exported.bytes.byteLength, deps.limits)
    if (tooBig) {
      onUpdate(i, { state: 'failed', code: 'too_large', message: tooBig })
      continue
    }

    const input: ImageUpload = {
      bytes: exported.bytes,
      format: request.format,
      nodeId: exported.nodeId,
      nodeName: exported.nodeName,
      fileName: exported.fileName,
      postId,
    }

    let retriedTransient = false
    let rateLimitWaits = 0
    for (;;) {
      onUpdate(i, { state: 'uploading' })
      try {
        const result = await deps.upload(input, signal)
        const attachMessage = result.attach_error
          ? codeMessage(result.attach_error.code, result.attach_error.message || 'Could not attach to the post.')
          : undefined
        onUpdate(i, { state: 'sent', result, attachMessage })
        break
      } catch (err) {
        if (signal.aborted) {
          skipRest(i, 'Cancelled.')
          return { kind: 'cancelled' }
        }
        if (!isApiError(err)) {
          onUpdate(i, { state: 'failed', message: errorMessage(err) })
          break
        }
        if (err.status === 401) {
          onUpdate(i, { state: 'failed', code: err.code, message: errorMessage(err) })
          skipRest(i + 1, 'Not sent: disconnected from Ogen.')
          return { kind: 'unauthorized' }
        }
        if (err.status === 402 || err.status === 403) {
          const message = errorMessage(err)
          onUpdate(i, { state: 'failed', code: err.code, message })
          skipRest(i + 1, 'Not sent: plan limit reached.')
          return { kind: 'quota', message, hint: upgradeHint(err) }
        }
        if (err.status === 429 && rateLimitWaits < MAX_RATE_LIMIT_WAITS) {
          rateLimitWaits++
          const wait = err.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS
          onUpdate(i, { state: 'waiting', untilMs: now() + wait })
          if (!(await pause(deps, wait, signal))) {
            skipRest(i, 'Cancelled.')
            return { kind: 'cancelled' }
          }
          continue
        }
        if ((err.status === 0 || err.status >= 500) && !retriedTransient) {
          retriedTransient = true
          if (!(await pause(deps, TRANSIENT_RETRY_DELAY_MS, signal))) {
            skipRest(i, 'Cancelled.')
            return { kind: 'cancelled' }
          }
          continue
        }
        onUpdate(i, { state: 'failed', code: err.code, message: errorMessage(err) })
        break
      }
    }
  }
  return { kind: 'done' }
}

async function pause(deps: QueueDeps, ms: number, signal: AbortSignal): Promise<boolean> {
  try {
    await deps.sleep(ms, signal)
    return !signal.aborted
  } catch {
    return false
  }
}
