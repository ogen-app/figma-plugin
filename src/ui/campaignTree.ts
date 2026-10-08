import type { Campaign, CampaignPost } from '../api/campaigns'
import type { PostTarget } from '../queue/types'

export interface DateGroup {
  // YYYY-MM-DD in the campaign's timezone, or "" for unscheduled posts.
  key: string
  label: string
  posts: CampaignPost[]
}

export const UNSCHEDULED = 'Unscheduled'

// groupByDate buckets posts by their publish day in the campaign's timezone
// (so days match the web app), in date order, unscheduled posts last.
export function groupByDate(posts: CampaignPost[], timezone: string): DateGroup[] {
  const zone = validZone(timezone)
  const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const labelFmt = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric' })
  const thisYear = keyFmt.format(new Date()).slice(0, 4)
  const yearFmt = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

  const groups = new Map<string, DateGroup>()
  const unscheduled: CampaignPost[] = []
  for (const post of posts) {
    const at = post.scheduled_at ? new Date(post.scheduled_at) : null
    if (!at || Number.isNaN(at.getTime())) {
      unscheduled.push(post)
      continue
    }
    const key = keyFmt.format(at)
    let group = groups.get(key)
    if (!group) {
      const label = (key.startsWith(thisYear) ? labelFmt : yearFmt).format(at)
      group = { key, label, posts: [] }
      groups.set(key, group)
    }
    group.posts.push(post)
  }
  const out = [...groups.values()].sort((a, b) => a.key.localeCompare(b.key))
  for (const g of out) g.posts.sort((a, b) => Date.parse(a.scheduled_at!) - Date.parse(b.scheduled_at!))
  if (unscheduled.length > 0) out.push({ key: '', label: UNSCHEDULED, posts: unscheduled })
  return out
}

// postTime is the publish time-of-day in the campaign's timezone, e.g. "09:00".
export function postTime(post: CampaignPost, timezone: string): string {
  if (!post.scheduled_at) return ''
  const at = new Date(post.scheduled_at)
  if (Number.isNaN(at.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', { timeZone: validZone(timezone), hour: '2-digit', minute: '2-digit' }).format(at)
}

// filterTree keeps campaigns whose name matches (with all their posts) and,
// for the rest, only posts whose title or platform matches.
export function filterTree(campaigns: Campaign[], query: string): Campaign[] {
  const q = query.trim().toLowerCase()
  if (!q) return campaigns
  const out: Campaign[] = []
  for (const c of campaigns) {
    if (c.name.toLowerCase().includes(q)) {
      out.push(c)
      continue
    }
    const posts = c.posts.filter((p) => p.title.toLowerCase().includes(q) || p.platform?.name.toLowerCase().includes(q))
    if (posts.length > 0) out.push({ ...c, posts })
  }
  return out
}

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const POST_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  ready_for_publish: { label: 'Ready', tone: 'info' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  scheduled_for_manual_publishing: { label: 'Manual', tone: 'info' },
  failed: { label: 'Failed', tone: 'danger' },
  published: { label: 'Published', tone: 'success' },
  not_published: { label: 'Not published', tone: 'warning' },
}

export function postStatus(status: string): { label: string; tone: StatusTone } {
  return POST_STATUS[status] ?? { label: humanize(status), tone: 'neutral' }
}

const CAMPAIGN_STATUS: Record<string, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
}

export function campaignStatus(status: string): string {
  return CAMPAIGN_STATUS[status] ?? humanize(status)
}

function humanize(s: string): string {
  const t = s.replace(/_/g, ' ').trim()
  return t ? t[0]!.toUpperCase() + t.slice(1) : ''
}

const zoneCache = new Map<string, string>()

// validZone falls back to UTC for "" or a zone this runtime doesn't know.
export function validZone(timezone: string): string {
  if (!timezone) return 'UTC'
  let zone = zoneCache.get(timezone)
  if (!zone) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone })
      zone = timezone
    } catch {
      zone = 'UTC'
    }
    zoneCache.set(timezone, zone)
  }
  return zone
}

// postTarget is what a send needs to know about a post it attaches to.
export function postTarget(campaign: Campaign, post: CampaignPost): PostTarget {
  const date = groupByDate([post], campaign.timezone)[0]
  const when = post.scheduled_at && date ? `${date.label}, ${postTime(post, campaign.timezone)}` : 'Unscheduled'
  return {
    id: post.id,
    title: post.title,
    campaignName: campaign.name,
    platformName: post.platform?.name ?? '',
    ...(post.video !== undefined ? { video: post.video } : {}),
    detail: [post.media?.label, when].filter(Boolean).join(' · '),
    attachable: post.attachable,
    maxAttachments: post.media?.max_attachments ?? null,
  }
}

// relativeTime is e.g. "just now", "5 min ago", "3 h ago", "2 d ago".
export function relativeTime(iso: string, now = Date.now()): string {
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return ''
  const min = Math.floor((now - at) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} d ago`
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(at)
}

// dateRange is a campaign's dates in its zone, e.g. "Jun 2 – Jul 13".
export function dateRange(campaign: Campaign): string {
  const zone = validZone(campaign.timezone)
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short', day: 'numeric' })
  const part = (iso: string | null) => {
    const at = iso ? Date.parse(iso) : Number.NaN
    return Number.isNaN(at) ? '' : fmt.format(at)
  }
  const from = part(campaign.start_date)
  const to = part(campaign.end_date)
  return from && to ? `${from} – ${to}` : from || to
}
