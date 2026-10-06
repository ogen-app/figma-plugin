import { describe, expect, it } from 'vitest'
import type { ImageResult } from '../src/api/images'
import type { ItemStatus } from '../src/queue/sendQueue'
import { headline, summarize } from '../src/queue/summary'

const result = (id: string, deduplicated = false): ImageResult => ({
  asset: { id, title: id, status: 'pending', url: '' },
  deduplicated,
  attachment: null,
  attach_error: null,
  open_url: `https://app.getogen.com/content-bank/assets/${id}`,
})

describe('summary', () => {
  it('counts outcomes and opens the first sent asset', () => {
    const statuses: ItemStatus[] = [
      { state: 'failed', message: 'x' },
      { state: 'sent', result: result('a1') },
      { state: 'sent', result: result('a2', true) },
      { state: 'sent', result: result('a3'), attachMessage: 'locked' },
      { state: 'skipped', message: 'Cancelled.' },
    ]
    const s = summarize(statuses)
    expect(s).toEqual({
      sent: 3,
      deduplicated: 1,
      notAttached: 1,
      withIssues: 0,
      failed: 1,
      skipped: 1,
      openUrl: 'https://app.getogen.com/content-bank/assets/a1',
    })
    expect(headline(s)).toBe('2 sent · 1 already in Ogen · 1 not attached · 1 failed · 1 not sent')
  })

  it('says when nothing was sent', () => {
    expect(headline(summarize([]))).toBe('Nothing was sent')
  })

  it('counts videos attached with platform issues', () => {
    const video = { kind: 'video', attachment: { id: 'v', post_id: 'p', duration_ms: 0, width: 0, height: 0 }, platform_validation: [], open_url: 'https://app/posts/p' } as const
    const s = summarize([
      { state: 'sent', result: { ...video, platform_validation: [] } },
      { state: 'sent', result: { ...video, platform_validation: [] }, platformIssues: 'too long' },
    ])
    expect(s).toMatchObject({ sent: 2, deduplicated: 0, withIssues: 1, openUrl: 'https://app/posts/p' })
    expect(headline(s)).toBe('2 sent · 1 with platform issues')
  })
})
