import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/api/client'
import type { ImageResult } from '../src/api/images'
import { DEFAULT_LIMITS } from '../src/api/types'
import { runSendQueue, type ItemStatus, type QueueDeps } from '../src/queue/sendQueue'
import type { SendRequest } from '../src/queue/types'
import type { SelectionItem } from '../src/shared/messages'

const items: SelectionItem[] = ['A', 'B', 'C'].map((name, i) => ({ id: `1:${i}`, name, type: 'FRAME', width: 100, height: 100 }))

const request = (over: Partial<SendRequest> = {}): SendRequest => ({
  items,
  format: 'PNG',
  scale: 2,
  destination: { kind: 'bank' },
  ...over,
})

const result = (id: string, over: Partial<ImageResult> = {}): ImageResult => ({
  asset: { id, title: id, status: 'pending', url: '' },
  deduplicated: false,
  attachment: null,
  attach_error: null,
  open_url: `https://app.getogen.com/content-bank/assets/${id}`,
  ...over,
})

type Step = ImageResult | ApiError | Error

function setup(steps: Step[], over: Partial<QueueDeps> = {}) {
  const uploads: Array<{ nodeId: string; postId?: string }> = []
  const sleeps: number[] = []
  const deps: QueueDeps = {
    exportNode: vi.fn(async (item: SelectionItem) => ({ bytes: new Uint8Array(10), nodeId: item.id, nodeName: item.name, fileName: 'File' })),
    upload: vi.fn(async (input) => {
      uploads.push({ nodeId: input.nodeId, postId: input.postId })
      const step = steps.shift()
      if (!step) throw new Error('no more steps')
      if (step instanceof Error) throw step
      return step
    }),
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    now: () => 0,
    limits: DEFAULT_LIMITS,
    ...over,
  }
  const finals: ItemStatus[] = []
  const history: Array<[number, ItemStatus['state']]> = []
  const onUpdate = (i: number, s: ItemStatus) => {
    finals[i] = s
    history.push([i, s.state])
  }
  return { deps, uploads, sleeps, finals, history, onUpdate }
}

const err = (status: number, code?: string, body?: unknown, retryAfterMs?: number) =>
  new ApiError(status, code, `HTTP ${status}`, retryAfterMs, body)

describe('runSendQueue', () => {
  it('sends items in order and reports progress', async () => {
    const t = setup([result('a1'), result('a2', { deduplicated: true }), result('a3')])
    const out = await runSendQueue(request(), t.deps, t.onUpdate, new AbortController().signal)
    expect(out).toEqual({ kind: 'done' })
    expect(t.finals.map((s) => s.state)).toEqual(['sent', 'sent', 'sent'])
    expect(t.history.slice(0, 3)).toEqual([
      [0, 'exporting'],
      [0, 'uploading'],
      [0, 'sent'],
    ])
  })

  it('passes the post id and reports attach errors without failing the item', async () => {
    const post = { id: 'p1', title: 'Launch', status: 'draft', platform: '', campaign: null, updated_at: '', attachment_count: 0 }
    const t = setup([
      result('a1', { attachment: { id: 'att', post_id: 'p1' } }),
      result('a2', { attach_error: { code: 'post_locked', message: 'locked' } }),
      result('a3'),
    ])
    await runSendQueue(request({ destination: { kind: 'post', post } }), t.deps, t.onUpdate, new AbortController().signal)
    expect(t.uploads.every((u) => u.postId === 'p1')).toBe(true)
    expect(t.finals[1]).toMatchObject({ state: 'sent', attachMessage: "The post was already sent for publishing and can't take new images." })
  })

  it('marks rejected items and continues', async () => {
    const t = setup([err(415, 'vector_rejected'), err(400, 'dimensions_exceeded'), result('a3')])
    const out = await runSendQueue(request(), t.deps, t.onUpdate, new AbortController().signal)
    expect(out.kind).toBe('done')
    expect(t.finals.map((s) => s.state)).toEqual(['failed', 'failed', 'sent'])
    expect(t.finals[1]).toMatchObject({ code: 'dimensions_exceeded', message: 'The image has too many pixels. Try a lower scale.' })
  })

  it('retries a 503 or network error once, then fails the item', async () => {
    const t = setup([err(503, 'service_unavailable'), result('a1'), err(0, 'network_error'), err(0, 'network_error'), result('a3')])
    await runSendQueue(request(), t.deps, t.onUpdate, new AbortController().signal)
    expect(t.finals.map((s) => s.state)).toEqual(['sent', 'failed', 'sent'])
    expect(t.uploads.map((u) => u.nodeId)).toEqual(['1:0', '1:0', '1:1', '1:1', '1:2'])
    expect(t.sleeps).toEqual([1000, 1000])
  })

  it('waits out a 429 and retries the same item', async () => {
    const t = setup([result('a1'), err(429, undefined, undefined, 7000), result('a2'), result('a3')])
    await runSendQueue(request(), t.deps, t.onUpdate, new AbortController().signal)
    expect(t.finals.map((s) => s.state)).toEqual(['sent', 'sent', 'sent'])
    expect(t.sleeps).toEqual([7000])
    expect(t.history).toContainEqual([1, 'waiting'])
  })

  it('stops on a quota error and skips the rest', async () => {
    const t = setup([result('a1'), err(402, 'entitlement_exceeded', { error: 'entitlement_exceeded', feature: 'content_bank_assets' })])
    const out = await runSendQueue(request(), t.deps, t.onUpdate, new AbortController().signal)
    expect(out).toEqual({
      kind: 'quota',
      message: 'Your workspace has reached its content bank limit.',
      hint: { text: 'Upgrade your plan in Ogen to send more.' },
    })
    expect(t.finals.map((s) => s.state)).toEqual(['sent', 'failed', 'skipped'])
    expect(t.uploads).toHaveLength(2)
  })

  it('stops on 401', async () => {
    const t = setup([err(401, 'plugin_token_invalid')])
    const out = await runSendQueue(request(), t.deps, t.onUpdate, new AbortController().signal)
    expect(out.kind).toBe('unauthorized')
    expect(t.finals.map((s) => s.state)).toEqual(['failed', 'skipped', 'skipped'])
  })

  it('fails an export over the byte limit without uploading it', async () => {
    const t = setup([result('a2'), result('a3')], { limits: { ...DEFAULT_LIMITS, max_image_bytes: 5 } })
    t.deps.exportNode = vi.fn(async (item: SelectionItem) => ({
      bytes: new Uint8Array(item.name === 'A' ? 10 : 1),
      nodeId: item.id,
      nodeName: item.name,
      fileName: 'File',
    }))
    await runSendQueue(request(), t.deps, t.onUpdate, new AbortController().signal)
    expect(t.finals.map((s) => s.state)).toEqual(['failed', 'sent', 'sent'])
    expect(t.uploads.map((u) => u.nodeId)).toEqual(['1:1', '1:2'])
  })

  it('fails an item Figma cannot export and continues', async () => {
    const t = setup([result('a2'), result('a3')])
    const ok = t.deps.exportNode
    t.deps.exportNode = vi.fn(async (item, f, s) => {
      if (item.name === 'A') throw new Error('The layer no longer exists.')
      return ok(item, f, s)
    })
    await runSendQueue(request(), t.deps, t.onUpdate, new AbortController().signal)
    expect(t.finals[0]).toEqual({ state: 'failed', message: 'Figma could not export this layer: The layer no longer exists.' })
  })

  it('skips the remaining items when cancelled', async () => {
    const ctrl = new AbortController()
    const t = setup([result('a1')])
    t.deps.upload = vi.fn(async () => {
      ctrl.abort()
      return result('a1')
    })
    const out = await runSendQueue(request(), t.deps, t.onUpdate, ctrl.signal)
    expect(out.kind).toBe('cancelled')
    expect(t.finals.map((s) => s.state)).toEqual(['sent', 'skipped', 'skipped'])
  })
})
