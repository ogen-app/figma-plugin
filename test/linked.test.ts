import { describe, expect, it } from 'vitest'
import { linkedTargets, resolveLinks } from '../src/queue/linked'
import type { PostTarget } from '../src/queue/types'
import type { SelectionItem } from '../src/shared/messages'
import { launchTab } from '../src/ui/app'

const item = (id: string, postId: string | null, x = 0, y = 0): SelectionItem => ({
  id,
  name: id,
  type: 'FRAME',
  width: 1080,
  height: 1080,
  x,
  y,
  ...(postId ? { link: { postId, campaignId: 'c' } } : {}),
})

const target = (id: string, over: Partial<PostTarget> = {}): PostTarget => ({ id, title: id, campaignName: 'C', platformName: 'Instagram', attachable: true, ...over })

describe('resolveLinks', () => {
  const byId = new Map([
    ['carousel', target('carousel', { maxAttachments: 10 })],
    ['single', target('single', { maxAttachments: 1 })],
    ['locked', target('locked', { attachable: false })],
  ])
  const targets = { byId, complete: new Set(['c']) }

  it('groups linked items by post, slides in reading order', () => {
    const out = resolveLinks(
      [item('loose', null), item('s2', 'carousel', 1160, 0), item('one', 'single'), item('s1', 'carousel', 0, 0), item('s3', 'carousel', 0, 2000)],
      targets,
    )
    expect(out.unlinked.map((i) => i.id)).toEqual(['loose'])
    expect(out.groups.map((g) => [g.target.id, g.items.map((i) => i.id)])).toEqual([
      ['carousel', ['s1', 's2', 's3']],
      ['single', ['one']],
    ])
    expect(linkedTargets(out.groups)).toEqual({ s1: byId.get('carousel'), s2: byId.get('carousel'), s3: byId.get('carousel'), one: byId.get('single') })
  })

  it('sets aside items linked to missing or locked posts, and flags crowded posts', () => {
    const out = resolveLinks([item('a', 'gone'), item('b', 'locked'), item('c', 'single'), item('d', 'single', 1200)], targets)
    expect(out.missing.map((i) => i.id)).toEqual(['a'])
    expect(out.locked.map((i) => i.id)).toEqual(['b'])
    expect(out.crowded.map((g) => g.target.id)).toEqual(['single'])
  })

  it("sends to a post by id when its campaign's list may be cut short", () => {
    const out = resolveLinks([item('a', 'past-cap')], { byId, complete: new Set() })
    expect(out.missing).toEqual([])
    expect(out.groups.map((g) => [g.target.id, g.target.title])).toEqual([['past-cap', 'a']])
  })

  it('holds linked items back while the posts load', () => {
    const out = resolveLinks([item('a', 'single'), item('b', null)], null)
    expect(out.groups).toEqual([])
    expect(out.unlinked.map((i) => i.id)).toEqual(['b'])
  })
})

describe('launchTab', () => {
  it('opens the tab the command names, else Boards on a board page', () => {
    expect(launchTab('boards', false)).toBe('boards')
    expect(launchTab('send', true)).toBe('send')
    expect(launchTab('', true)).toBe('boards')
    expect(launchTab('', false)).toBe('send')
  })
})
