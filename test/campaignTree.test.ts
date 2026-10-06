import { describe, expect, it } from 'vitest'
import { toCampaigns, type Campaign, type CampaignPost } from '../src/api/campaigns'
import { filterTree, groupByDate, postStatus, postTime, UNSCHEDULED } from '../src/ui/campaignTree'

const post = (id: string, scheduled_at: string | null, over: Partial<CampaignPost> = {}): CampaignPost => ({
  id,
  title: id,
  status: 'draft',
  platform: { id: 'li', name: 'LinkedIn' },
  scheduled_at,
  attachment_count: 0,
  attachable: true,
  ...over,
})

describe('groupByDate', () => {
  it('groups by day in the campaign timezone, in order, unscheduled last', () => {
    const posts = [
      post('late', '2030-10-12T22:30:00Z'), // Oct 13 in Kyiv (UTC+3)
      post('none', null),
      post('morning', '2030-10-12T06:00:00Z'),
      post('noon', '2030-10-12T09:00:00Z'),
    ]
    const groups = groupByDate(posts, 'Europe/Kyiv')
    expect(groups.map((g) => [g.key, g.posts.map((p) => p.id)])).toEqual([
      ['2030-10-12', ['morning', 'noon']],
      ['2030-10-13', ['late']],
      ['', ['none']],
    ])
    expect(groups[0]!.label).toBe('Sat, Oct 12, 2030')
    expect(groups[2]!.label).toBe(UNSCHEDULED)
  })

  it('treats an empty or unknown timezone as UTC', () => {
    const p = post('late', '2030-10-12T22:30:00Z')
    expect(groupByDate([p], '')[0]!.key).toBe('2030-10-12')
    expect(groupByDate([p], 'Mars/Olympus')[0]!.key).toBe('2030-10-12')
  })

  it('omits the year for dates in the current year', () => {
    const now = new Date()
    now.setUTCHours(12, 0, 0, 0)
    const label = groupByDate([post('p', now.toISOString())], 'UTC')[0]!.label
    expect(label).not.toMatch(/\d{4}/)
  })
})

describe('postTime', () => {
  it('formats the publish time in the campaign timezone', () => {
    expect(postTime(post('p', '2030-10-12T06:00:00Z'), 'Europe/Kyiv')).toBe('09:00')
    expect(postTime(post('p', null), 'UTC')).toBe('')
  })
})

describe('filterTree', () => {
  const campaigns: Campaign[] = [
    { id: 'c1', name: 'Q4 Launch', status: 'active', timezone: '', start_date: null, end_date: null, posts: [post('Teaser', null), post('Recap', null)] },
    {
      id: 'c2',
      name: 'Webinar',
      status: 'draft',
      timezone: '',
      start_date: null,
      end_date: null,
      posts: [post('Launch reminder', null), post('Promo', null, { platform: { id: 'ig', name: 'Instagram' } })],
    },
  ]

  it('keeps a matching campaign whole and narrows others to matching posts', () => {
    const out = filterTree(campaigns, 'launch')
    expect(out.map((c) => [c.id, c.posts.map((p) => p.id)])).toEqual([
      ['c1', ['Teaser', 'Recap']],
      ['c2', ['Launch reminder']],
    ])
  })

  it('matches platform names and returns everything for a blank query', () => {
    expect(filterTree(campaigns, 'insta').map((c) => c.posts.map((p) => p.id))).toEqual([['Promo']])
    expect(filterTree(campaigns, '  ')).toBe(campaigns)
  })
})

describe('postStatus', () => {
  it('labels known statuses and humanizes unknown ones', () => {
    expect(postStatus('ready_for_publish')).toEqual({ label: 'Ready', tone: 'info' })
    expect(postStatus('published')).toEqual({ label: 'Published', tone: 'success' })
    expect(postStatus('in_review')).toEqual({ label: 'In review', tone: 'neutral' })
  })
})

describe('toCampaigns', () => {
  it('normalizes the response and drops malformed rows', () => {
    const out = toCampaigns({
      campaigns: [
        {
          id: 'c1',
          name: 'Q4',
          status: 'active',
          timezone: 'Europe/Kyiv',
          start_date: null,
          posts: [
            { id: 'p1', title: 'Teaser', status: 'scheduled', platform: null, scheduled_at: '2030-10-12T06:00:00Z', attachable: false },
            { title: 'no id' },
          ],
        },
        { name: 'no id' },
        { id: 'c2', posts: null },
      ],
    })
    expect(out).toEqual([
      {
        id: 'c1',
        name: 'Q4',
        status: 'active',
        timezone: 'Europe/Kyiv',
        start_date: null,
        end_date: null,
        posts: [{ id: 'p1', title: 'Teaser', status: 'scheduled', platform: null, scheduled_at: '2030-10-12T06:00:00Z', attachment_count: 0, attachable: false }],
      },
      { id: 'c2', name: '', status: '', timezone: '', start_date: null, end_date: null, posts: [] },
    ])
    expect(toCampaigns({ campaigns: null })).toEqual([])
  })
})
