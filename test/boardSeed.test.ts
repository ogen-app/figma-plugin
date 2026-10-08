import { describe, expect, it, vi } from 'vitest'
import { toCampaigns, type Campaign, type CampaignPost, type PostAttachment, type PostTypeRule } from '../src/api/campaigns'
import { diffBoard, noteChips, parseLink, type FrameLink } from '../src/shared/board'
import { planBoard } from '../src/ui/boardPlan'
import { runSeeds, seedJobs, seedSummary, type SeedJob } from '../src/ui/boardSeed'

const rule = (slug: string, over: Partial<PostTypeRule> = {}): PostTypeRule => ({
  slug,
  label: slug,
  allowed_kinds: ['image'],
  min_attachments: 1,
  max_attachments: 10,
  canvas: { width: 1080, height: 1350 },
  ...over,
})

const att = (id: string, over: Partial<PostAttachment> = {}): PostAttachment => ({
  id,
  kind: 'image',
  position: 0,
  width: 1080,
  height: 1350,
  previewUrl: `https://r2.example/${id}`,
  ...over,
})

const post = (id: string, over: Partial<CampaignPost> = {}): CampaignPost => ({
  id,
  title: id,
  status: 'draft',
  platform: { id: 'ig', name: 'Instagram' },
  post_type: 'image-post',
  scheduled_at: '2030-06-03T09:00:00Z',
  attachment_count: 0,
  attachable: true,
  media: rule('image-post'),
  ...over,
})

const campaign = (posts: CampaignPost[]): Campaign => ({
  id: 'c',
  name: 'C',
  status: 'active',
  timezone: 'UTC',
  start_date: null,
  end_date: null,
  posts_changed_at: null,
  posts,
})

const plan = (posts: CampaignPost[]) => planBoard(campaign(posts), { workspaceId: 'w', now: new Date('2030-06-01T00:00:00Z') })

describe('post media from the API (CON-356)', () => {
  it('keeps the whole post’s media in order, with https previews only', () => {
    const [p] = toCampaigns({
      campaigns: [
        {
          id: 'c',
          posts: [
            {
              id: 'p',
              media: [
                { id: 'b', kind: 'image', position: 1, width: 10, height: 10, preview_url: 'https://x/b' },
                { id: 'a', kind: 'image', position: 0, width: 4000, height: 5000, preview_url: 'https://x/a', preview_width: 2160, preview_height: 2700 },
                { id: 'seg', kind: 'image', position: 2, segment_index: 0, preview_url: 'https://x/s' },
                { id: 'pdf', kind: 'pdf', position: 3, preview_url: null },
                { id: 'bad', kind: 'image', position: 4, preview_url: 'javascript:alert(1)' },
              ],
            },
          ],
        },
      ],
    })[0]!.posts
    expect(p!.attachments).toEqual([
      { id: 'a', kind: 'image', position: 0, width: 2160, height: 2700, previewUrl: 'https://x/a' },
      { id: 'b', kind: 'image', position: 1, width: 10, height: 10, previewUrl: 'https://x/b' },
      { id: 'pdf', kind: 'pdf', position: 3, width: 0, height: 0, previewUrl: null },
      { id: 'bad', kind: 'image', position: 4, width: 0, height: 0, previewUrl: null },
    ])
  })

  it('leaves attachments undefined on an older server', () => {
    expect(toCampaigns({ campaigns: [{ id: 'c', posts: [{ id: 'p' }] }] })[0]!.posts[0]!.attachments).toBeUndefined()
  })
})

describe('planning media into slots', () => {
  it('fills slots in order and adds carousel slides up to the cap', () => {
    const { plan: p, stats } = plan([
      post('carousel', { post_type: 'carousel', media: rule('carousel', { min_attachments: 2, max_attachments: 3 }), attachments: ['a', 'b', 'c', 'd'].map((id, i) => att(id, { position: i })) }),
      post('single', { attachments: [att('s')] }),
      post('empty', { attachments: [] }),
    ])
    const byId = Object.fromEntries(p.posts.map((x) => [x.postId, x]))
    expect(byId.carousel!.slots.map((s) => s.seed?.attachmentId)).toEqual(['a', 'b', 'c'])
    expect(byId.single!.slots.map((s) => s.seed?.attachmentId)).toEqual(['s'])
    expect(byId.empty!.slots[0]!.seed).toBeUndefined()
    expect(byId.carousel!.attachmentIds).toEqual(['a', 'b', 'c', 'd'])
    expect(stats.seededImages).toBe(4)
  })

  it("uses a video's poster when there's no image, and flags a crop", () => {
    const { plan: p, stats } = plan([
      post('reel', { post_type: 'reel', media: rule('reel', { allowed_kinds: ['video'], canvas: { width: 1080, height: 1920 } }), attachments: [att('v', { kind: 'video', width: 1080, height: 1080 })] }),
      post('pdf', { attachments: [att('d', { kind: 'pdf', previewUrl: null })] }),
    ])
    expect(p.posts[0]!.slots[0]!.seed).toEqual({ attachmentId: 'v', kind: 'video', url: 'https://r2.example/v', cropped: true })
    expect(p.posts[1]!.slots[0]!.seed).toBeUndefined()
    expect(stats.seededPosters).toBe(1)
  })
})

const link = (over: Partial<FrameLink> = {}): FrameLink => ({
  v: 1,
  postId: 'single',
  campaignId: 'c',
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

describe('seeded frames', () => {
  const seed = { attachmentId: 's', kind: 'image' as const, imageHash: 'h', cropped: false }

  it('flags a seeded frame whose image was removed in Ogen', () => {
    const frame = (l: FrameLink) => ({ nodeId: '1', link: l, x: 0, y: 0, height: 1350, cell: '2030-06-03' })
    const { plan: kept } = plan([post('single', { attachments: [att('s')] })])
    expect(diffBoard(kept, [frame(link({ seed }))]).issues.get('1')).toEqual([])
    const { plan: removed } = plan([post('single', { attachments: [] })])
    expect(diffBoard(removed, [frame(link({ seed }))]).issues.get('1')).toEqual(['Image removed in Ogen'])
    // Without media from the server nothing can be told.
    const { plan: unknown } = plan([post('single')])
    expect(diffBoard(unknown, [frame(link({ seed }))]).issues.get('1')).toEqual([])
  })

  it('shows where the image came from in the chips', () => {
    expect(noteChips({ sent: '', issues: ['Image removed in Ogen'], seed: { ...seed, cropped: true } })).toEqual([
      { text: 'Image from Ogen', tone: 'info' },
      { text: 'Image cropped to fit', tone: 'muted' },
      { text: 'Image removed in Ogen', tone: 'muted' },
    ])
    expect(noteChips({ sent: '', issues: [], seed: { ...seed, kind: 'video' } })).toEqual([{ text: 'Video poster from Ogen', tone: 'info' }])
  })

  it('stores the seed on the frame', () => {
    expect(parseLink(JSON.stringify({ postId: 'p', seed }))?.seed).toEqual(seed)
    expect(parseLink(JSON.stringify({ postId: 'p', seed: { attachmentId: 's' } }))?.seed).toBeUndefined()
  })
})

describe('placing media', () => {
  const { plan: p } = plan([post('a', { attachments: [att('x')] }), post('b', { attachments: [att('y')] }), post('c')])
  const targets = p.posts.map((x, i) => ({ nodeId: `n${i}`, postId: x.postId, slot: 0 }))

  it('pairs frames with their planned media', () => {
    expect(seedJobs(p, targets).map((j) => [j.nodeId, j.seed.attachmentId])).toEqual([
      ['n0', 'x'],
      ['n1', 'y'],
    ])
  })

  it('places in order, counts failures and goes on', async () => {
    const jobs = seedJobs(p, targets)
    const set: string[] = []
    const progress: number[] = []
    const out = await runSeeds(
      jobs,
      {
        fetchBytes: vi.fn(async (url: string) => {
          if (url.endsWith('/x')) throw new Error('HTTP 403')
          return new Uint8Array([1])
        }),
        setImage: async (job: SeedJob) => {
          set.push(job.nodeId)
        },
      },
      (done) => progress.push(done),
      new AbortController().signal,
    )
    expect(out).toEqual({ placed: 1, failed: ['n0'], cancelled: false })
    expect(set).toEqual(['n1'])
    expect(progress).toEqual([0, 1, 2])
    expect(seedSummary(out)).toBe('1 with media from Ogen. 1 image could not be loaded.')
  })

  it('stops when cancelled', async () => {
    const ctrl = new AbortController()
    const out = await runSeeds(
      seedJobs(p, targets),
      {
        fetchBytes: async () => new Uint8Array([1]),
        setImage: async () => {
          ctrl.abort()
        },
      },
      () => undefined,
      ctrl.signal,
    )
    expect(out).toEqual({ placed: 1, failed: [], cancelled: true })
  })
})
