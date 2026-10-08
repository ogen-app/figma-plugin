import { describe, expect, it } from 'vitest'
import type { Campaign, CampaignPost, PostTypeRule } from '../src/api/campaigns'
import {
  addDays,
  cellAt,
  diffBoard,
  dayIndex,
  mondayOf,
  noteChips,
  parseLink,
  parseMeta,
  parseTag,
  placeFlow,
  placeStack,
  readingOrder,
  sameColor,
  syncSummary,
  type ExistingFrame,
  type FrameLink,
  type Grid,
} from '../src/shared/board'
import { planBoard, rangeLabel } from '../src/ui/boardPlan'

const rule = (slug: string, over: Partial<PostTypeRule> = {}): PostTypeRule => ({
  slug,
  label: slug,
  allowed_kinds: ['image'],
  min_attachments: 1,
  max_attachments: 10,
  canvas: null,
  ...over,
})

const post = (id: string, scheduled_at: string | null, over: Partial<CampaignPost> = {}): CampaignPost => ({
  id,
  title: id,
  status: 'draft',
  platform: { id: 'ig', name: 'Instagram' },
  post_type: 'image-post',
  scheduled_at,
  attachment_count: 0,
  attachable: true,
  media: rule('image-post', { label: 'Image', canvas: { width: 1080, height: 1350 } }),
  ...over,
})

const campaign = (posts: CampaignPost[], over: Partial<Campaign> = {}): Campaign => ({
  id: 'c1',
  name: 'Summer',
  status: 'active',
  timezone: 'Europe/Kyiv',
  start_date: null,
  end_date: null,
  posts_changed_at: null,
  posts,
  ...over,
})

const NOW = new Date('2030-06-01T10:00:00Z')

describe('calendar helpers', () => {
  it('finds the ISO week Monday and day column', () => {
    expect(mondayOf('2030-06-05')).toBe('2030-06-03') // Wednesday
    expect(mondayOf('2030-06-03')).toBe('2030-06-03')
    expect(mondayOf('2030-06-09')).toBe('2030-06-03') // Sunday
    expect(dayIndex('2030-06-09')).toBe(6)
    expect(addDays('2030-12-30', 3)).toBe('2031-01-02')
  })

  it('labels week ranges', () => {
    expect(rangeLabel('2030-06-03', '2030-06-09')).toBe('Jun 3 – 9')
    expect(rangeLabel('2030-06-24', '2030-06-30')).toBe('Jun 24 – 30')
    expect(rangeLabel('2030-07-29', '2030-08-04')).toBe('Jul 29 – Aug 4')
    expect(rangeLabel('2030-12-30', '2031-01-05')).toBe('Dec 30, 2030 – Jan 5, 2031')
  })
})

describe('planBoard', () => {
  it('buckets posts by day in the campaign zone', () => {
    // 22:30 UTC on Sunday is 01:30 on Monday in Kyiv: next week.
    const { plan } = planBoard(campaign([post('late', '2030-06-09T22:30:00Z')]), { workspaceId: 'w', now: NOW })
    expect(plan.posts[0]!.dayKey).toBe('2030-06-10')
    expect(plan.weeks.map((w) => w.key)).toEqual(['2030-06-10'])
  })

  it('keeps day boundaries across a DST change', () => {
    // Kyiv moves to summer time on 2030-03-31; 21:30 UTC is 00:30 next day after it.
    const { plan } = planBoard(campaign([post('a', '2030-03-30T21:30:00Z'), post('b', '2030-03-31T21:30:00Z')]), { workspaceId: 'w', now: NOW })
    expect(plan.posts.map((p) => p.dayKey)).toEqual(['2030-03-30', '2030-04-01'])
  })

  it('spans the campaign dates, including empty weeks', () => {
    const { plan, stats } = planBoard(
      campaign([post('a', '2030-06-12T09:00:00Z')], { start_date: '2030-06-03T00:00:00Z', end_date: '2030-06-25T00:00:00Z' }),
      { workspaceId: 'w', now: NOW },
    )
    expect(plan.weeks.map((w) => w.key)).toEqual(['2030-06-03', '2030-06-10', '2030-06-17', '2030-06-24'])
    expect(plan.weeks[0]!.label).toBe('Week 1\nJun 3 – 9')
    expect(plan.weeks[0]!.days[0]).toBe('Mon, Jun 3')
    expect(plan.subtitle).toBe('Jun 3 – 30 · Active')
    expect(stats.weeks).toBe(4)
  })

  it('plans slots from the post type rules', () => {
    const { plan, stats } = planBoard(
      campaign([
        post('img', '2030-06-03T09:00:00Z'),
        post('carousel', '2030-06-03T10:00:00Z', { post_type: 'carousel', media: rule('carousel', { label: 'Carousel', min_attachments: 2 }) }),
        post('text', '2030-06-04T09:00:00Z', { post_type: 'text-post', media: rule('text-post', { allowed_kinds: [], min_attachments: 0, max_attachments: 0 }) }),
        post('story', null, { post_type: 'story', media: rule('story', { label: 'Story', allowed_kinds: ['image', 'video'] }) }),
        post('untyped', null, { post_type: '', media: undefined }),
      ]),
      { workspaceId: 'w', now: NOW },
    )
    const byId = Object.fromEntries(plan.posts.map((p) => [p.postId, p]))
    expect(byId.img!.slots.map((s) => [s.width, s.height])).toEqual([[1080, 1350]])
    // One line under the frame; the title is the frame's name.
    expect(byId.img!.slots[0]!.note).toBe('Instagram · Image · 12:00 · 1080×1350')
    expect(byId.img!.slots[0]!.name).toBe('img')
    expect(byId.carousel!.slots.map((s) => s.name)).toEqual(['carousel · 1/2', 'carousel · 2/2'])
    expect(byId.carousel!.slots.map((s) => s.legacyName)).toEqual(['carousel · Instagram Carousel · 1/2', 'carousel · Instagram Carousel · 2/2'])
    expect(byId.text!.slots).toEqual([])
    // No canvas from the server: the format's default, flagged as such.
    expect(byId.story!.slots[0]).toMatchObject({ width: 1080, height: 1920 })
    expect(byId.story!.slots[0]!.note).toBe('Instagram · Story · Unscheduled · 1080×1920 (default size)')
    expect(byId.untyped!.slots[0]!.note).toContain('Post type not set')
    expect(stats).toEqual({ weeks: 1, posts: 5, placeholders: 5, textOnly: 1, unscheduled: 2, noType: 1, seededImages: 0, seededPosters: 0 })
  })
})

const link = (postId: string, over: Partial<FrameLink> = {}): FrameLink => ({
  v: 1,
  postId,
  campaignId: 'c1',
  slot: 0,
  dayKey: '2030-06-03',
  width: 1080,
  height: 1350,
  note: '',
  name: '',
  issues: [],
  sent: '',
  ...over,
})

const frame = (nodeId: string, l: FrameLink, cell: string | null = l.dayKey, x = 0, y = 0): ExistingFrame => ({
  nodeId,
  link: l,
  x,
  y,
  height: l.height,
  cell,
})

describe('diffBoard', () => {
  const { plan } = planBoard(
    campaign([
      post('kept', '2030-06-03T09:00:00Z'),
      post('moved', '2030-06-05T09:00:00Z'),
      post('new', '2030-06-04T09:00:00Z'),
      post('resized', '2030-06-03T09:00:00Z', { post_type: 'story', media: rule('story', { label: 'Story', canvas: { width: 1080, height: 1920 } }) }),
      post('locked', '2030-06-03T09:00:00Z', { attachable: false }),
    ]),
    { workspaceId: 'w', now: NOW },
  )

  it('adds missing posts and flags changed ones without touching the rest', () => {
    const diff = diffBoard(plan, [
      frame('1', link('kept')),
      frame('2', link('moved')),
      frame('3', link('resized')),
      frame('4', link('locked')),
      frame('5', link('gone')),
    ])
    expect(diff.add.map((p) => p.postId)).toEqual(['new'])
    expect(Object.fromEntries(diff.issues)).toEqual({
      '1': [],
      // The frame was on Mon, Jun 3 (link('moved') is placed there).
      '2': ['Moved from Mon, Jun 3'],
      '3': ['Now Instagram Story · 1080×1920'],
      '4': ["Scheduled, can't take new media"],
      '5': ['Deleted in Ogen'],
    })
    expect(diff.moves.map((m) => [m.post.postId, m.post.dayKey, m.nodeIds])).toEqual([['moved', '2030-06-05', ['2']]])
    expect(diff.counts).toEqual({ added: 1, deleted: 1, moved: 1, changed: 1 })
    expect(syncSummary(diff.counts)).toBe('1 added · 1 deleted · 1 moved · 1 changed')
  })

  it('accepts a frame the designer dragged to the right day', () => {
    const diff = diffBoard(plan, [frame('2', link('moved'), '2030-06-05')])
    expect(diff.issues.get('2')).toEqual([])
    expect(diff.moves).toEqual([])
  })

  it('judges a post by its first frame, so spilled slides are not moved', () => {
    const l = link('kept')
    const diff = diffBoard(plan, [frame('a', l, '2030-06-03', 0, 0), frame('b', { ...l, slot: 1 }, '2030-06-04', 2400, 0)])
    expect(diff.issues.get('a')).toEqual([])
    expect(diff.issues.get('b')).toEqual([])
  })

  it("doesn't call a post deleted when the list may be cut short", () => {
    const diff = diffBoard({ ...plan, complete: false }, [frame('5', link('gone'))])
    expect(diff.issues.get('5')).toEqual([])
    expect(diff.counts.deleted).toBe(0)
  })

  it('moves an unscheduled post that got a date, and one that lost it', () => {
    const { plan: p } = planBoard(campaign([post('dated', '2030-06-04T09:00:00Z'), post('undated', null)]), { workspaceId: 'w', now: NOW })
    const diff = diffBoard(p, [frame('a', link('dated', { dayKey: '' }), ''), frame('b', link('undated'), '2030-06-03')])
    expect(diff.moves.map((m) => [m.post.postId, m.post.dayKey])).toEqual([
      ['dated', '2030-06-04'],
      ['undated', ''],
    ])
    expect(diff.issues.get('a')).toEqual(['Moved from Unscheduled'])
    expect(diff.issues.get('b')).toEqual(['Moved from Mon, Jun 3'])
  })

  it('moves only the frames not on the new day yet', () => {
    // 'moved' is now on Wed, Jun 5. Its first slide is still on Mon; the
    // designer already dragged the second one to Wed.
    const diff = diffBoard(plan, [
      frame('s1', link('moved'), '2030-06-03', 0, 0),
      frame('s2', link('moved', { slot: 1 }), '2030-06-05', 5000, 0),
    ])
    expect(diff.moves.map((m) => m.nodeIds)).toEqual([['s1']])
    expect(diff.issues.get('s1')).toEqual(['Moved from Mon, Jun 3'])
    expect(diff.issues.get('s2')).toEqual([])
    expect(diff.counts.moved).toBe(1)
  })

  it("keeps a now text-only post's frames where they are", () => {
    const { plan: p } = planBoard(
      campaign([post('t', '2030-06-05T09:00:00Z', { post_type: 'text-post', media: rule('text-post', { allowed_kinds: [], min_attachments: 0, max_attachments: 0 }) })]),
      { workspaceId: 'w', now: NOW },
    )
    const diff = diffBoard(p, [frame('t1', link('t'))])
    expect(diff.moves).toEqual([])
    expect(diff.issues.get('t1')).toEqual(['Now a text-only post'])
  })

  it('reports an unchanged board as up to date', () => {
    expect(syncSummary({ added: 0, deleted: 0, moved: 0, changed: 0 })).toBe('Up to date')
  })
})

describe('layout', () => {
  const { plan } = planBoard(
    campaign([
      post('a', '2030-06-03T09:00:00Z'),
      post('b', '2030-06-03T10:00:00Z', { post_type: 'carousel', media: rule('carousel', { min_attachments: 2, canvas: { width: 1080, height: 1080 } }) }),
    ]),
    { workspaceId: 'w', now: NOW },
  )

  it('stacks posts and puts carousel slides side by side', () => {
    const { placements, bottom } = placeStack(plan.posts, 0, 0)
    expect(placements.map((p) => [p.slot.postId, p.x, p.y])).toEqual([
      ['a', 0, 80],
      ['b', 0, 80 + 1350 + 180 + 160 + 80],
      ['b', 1160, 80 + 1350 + 180 + 160 + 80],
    ])
    // Each post: room for Figma's label, the frame, the note under it, a gap.
    expect(bottom).toBe(1850 + 1080 + 180 + 160)
  })

  it('wraps the unscheduled row', () => {
    const { placements } = placeFlow(plan.posts, 0, 0, 3000)
    expect(placements.map((p) => [p.x, p.y])).toEqual([
      [0, 80],
      [0, 80 + 1350 + 180 + 160 + 80],
      [1160, 80 + 1350 + 180 + 160 + 80],
    ])
  })

  it('finds the cell under a point', () => {
    const grid: Grid = {
      x: 0,
      labelWidth: 900,
      columnWidth: 1000,
      rows: [
        { key: '2030-06-03', y: 0, height: 500 },
        { key: '', y: 800, height: 500 },
      ],
    }
    expect(cellAt(grid, 950, 10)).toBe('2030-06-03')
    expect(cellAt(grid, 2950, 10)).toBe('2030-06-05')
    expect(cellAt(grid, 100, 10)).toBeNull() // the label column
    expect(cellAt(grid, 950, 600)).toBeNull() // between rows
    expect(cellAt(grid, 5000, 900)).toBe('')
  })

  it('orders frames the way a carousel reads', () => {
    const f = (x: number, y: number) => ({ x, y, height: 100 })
    expect([f(200, 0), f(0, 10), f(0, 300)].sort(readingOrder)).toEqual([f(0, 10), f(200, 0), f(0, 300)])
  })
})

describe('sameColor', () => {
  it("matches a colour that went through Figma's 32-bit floats", () => {
    const grey = { r: 236 / 255, g: 236 / 255, b: 239 / 255 }
    const stored = { r: Math.fround(grey.r), g: Math.fround(grey.g), b: Math.fround(grey.b) }
    expect(stored.r === grey.r).toBe(false)
    expect(sameColor(stored, grey)).toBe(true)
    expect(sameColor(stored, { r: 1, g: 1, b: 1 })).toBe(false)
    expect(sameColor({ ...stored, b: stored.b + 2 / 255 }, grey)).toBe(false)
    // A designer's edit finer than an 8-bit step is still a different colour.
    expect(sameColor({ ...stored, r: stored.r + 1e-4 }, grey)).toBe(false)
  })
})

describe('today', () => {
  it("is today's date in the campaign's zone", () => {
    // 22:30 UTC is already the next day in Kyiv.
    const { plan } = planBoard(campaign([]), { workspaceId: 'w', now: new Date('2030-06-09T22:30:00Z') })
    expect(plan.todayKey).toBe('2030-06-10')
  })
})

describe('stored state', () => {
  it('parses the grid tags', () => {
    expect(parseTag('{"kind":"band","key":"2030-06-03"}')).toEqual({ kind: 'band', key: '2030-06-03' })
    expect(parseTag('{"kind":"day-line","key":"2030-06-03","day":5}')).toEqual({ kind: 'day-line', key: '2030-06-03', day: 5 })
    expect(parseTag('{"kind":"weekend","key":"k"}')).toEqual({ kind: 'weekend', key: 'k' })
    expect(parseTag('{"kind":"today"}')).toEqual({ kind: 'today' })
    expect(parseTag('{"kind":"nope"}')).toBeNull()
  })

  it("keeps the frame's generated name", () => {
    expect(parseLink(JSON.stringify({ postId: 'p', name: 'Teaser · 1/2' }))?.name).toBe('Teaser · 1/2')
  })

  it('parses links and board meta defensively', () => {
    expect(parseLink('')).toBeNull()
    expect(parseLink('{"postId":""}')).toBeNull()
    expect(parseLink('not json')).toBeNull()
    expect(parseLink(JSON.stringify({ postId: 'p', issues: ['x', 1] }))).toEqual({ ...link('p', { v: 0, campaignId: '', dayKey: '', width: 0, height: 0 }), issues: ['x'] })
    const meta = parseMeta(JSON.stringify({ v: 1, campaignId: 'c', grid: { rows: [{ key: 'k', y: 1, height: 2 }, 3] } }))
    expect(meta?.grid.rows).toEqual([{ key: 'k', y: 1, height: 2 }])
  })

  it('turns send status and issues into chips', () => {
    expect(noteChips({ sent: '', issues: [] })).toEqual([])
    expect(noteChips({ sent: '✓ Sent Oct 8, 14:05', issues: ['Deleted in Ogen', 'Moved from Fri, Jun 7'] })).toEqual([
      { text: '✓ Sent Oct 8, 14:05', tone: 'success' },
      { text: '⚠ Deleted in Ogen', tone: 'danger' },
      { text: 'Moved from Fri, Jun 7', tone: 'muted' },
    ])
  })
})
