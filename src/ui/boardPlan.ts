import type { Campaign, CampaignPost, Canvas } from '../api/campaigns'
import { addDays, mondayOf, type BoardPlan, type PlannedPost, type PlannedSlot, type PlannedWeek } from '../shared/board'
import { campaignStatus, validZone } from './campaignTree'

// planBoard turns a campaign into the board main draws (CON-354): the weeks
// it spans, and a placeholder per media slot of each post, at the post
// type's canvas. Days are the campaign's, in its timezone.

export interface PlanOptions {
  workspaceId: string
  now?: Date
  // False when the post list may be cut short (see BoardPlan.complete).
  complete?: boolean
}

export interface PlanStats {
  weeks: number
  posts: number
  placeholders: number
  textOnly: number
  unscheduled: number
  // Posts with no post type yet: they get a square placeholder.
  noType: number
}

// A campaign spanning longer than this shows only the weeks with posts.
const MAX_EMPTY_SPAN_WEEKS = 60

// Canvases used when the server has none for a post type (until CON-351).
// Vertical video formats are 9:16 everywhere; the rest default to square.
const DEFAULT_CANVAS: Record<string, Canvas> = {
  story: { width: 1080, height: 1920 },
  reel: { width: 1080, height: 1920 },
  short: { width: 1080, height: 1920 },
  video: { width: 1920, height: 1080 },
}
const SQUARE: Canvas = { width: 1080, height: 1080 }

export function planBoard(campaign: Campaign, opts: PlanOptions): { plan: BoardPlan; stats: PlanStats } {
  const now = opts.now ?? new Date()
  const zone = validZone(campaign.timezone)
  const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit' })
  const dayOf = (iso: string | null): { key: string; at: number } | null => {
    if (!iso) return null
    const at = Date.parse(iso)
    return Number.isNaN(at) ? null : { key: dayFmt.format(at), at }
  }

  const stats: PlanStats = { weeks: 0, posts: campaign.posts.length, placeholders: 0, textOnly: 0, unscheduled: 0, noType: 0 }
  const posts: PlannedPost[] = campaign.posts.map((post) => {
    const day = dayOf(post.scheduled_at)
    const planned = planPost(post, day, (at) => timeFmt.format(at))
    if (!day) stats.unscheduled++
    if (!post.post_type) stats.noType++
    if (planned.slots.length === 0) stats.textOnly++
    stats.placeholders += planned.slots.length
    return planned
  })
  posts.sort((a, b) => a.at - b.at)

  const weeks = planWeeks(
    posts.filter((p) => p.dayKey).map((p) => p.dayKey),
    dayOf(campaign.start_date)?.key,
    dayOf(campaign.end_date)?.key,
  )
  stats.weeks = weeks.length

  const first = weeks[0]?.key
  const last = weeks.at(-1)
  const range = first && last ? rangeLabel(first, addDays(last.key, 6)) : ''
  const plan: BoardPlan = {
    campaignId: campaign.id,
    workspaceId: opts.workspaceId,
    title: campaign.name || 'Untitled campaign',
    subtitle: [range, campaignStatus(campaign.status)].filter(Boolean).join(' · '),
    syncedAt: now.toISOString(),
    syncedLabel: `Last synced ${syncedFmt.format(now)}`,
    weeks,
    posts,
    todayKey: dayFmt.format(now),
    complete: opts.complete ?? true,
  }
  return { plan, stats }
}

function planPost(post: CampaignPost, day: { key: string; at: number } | null, time: (at: number) => string): PlannedPost {
  const platform = post.platform?.name ?? 'No platform'
  const typeLabel = post.media?.label ?? (post.post_type ? humanize(post.post_type) : 'Post type not set')
  const known = post.media?.canvas ?? null
  const canvas = known ?? (post.post_type ? (DEFAULT_CANVAS[post.post_type] ?? SQUARE) : SQUARE)
  const size = `${canvas.width}×${canvas.height}`
  const dayLabel = day ? labelOf(day.key) : 'Unscheduled'
  const title = post.title || 'Untitled post'

  // A type the server says takes no attachments is text-only. An unknown
  // type still gets one placeholder: better a frame too many than none.
  const textOnly = post.media?.max_attachments === 0
  const count = textOnly ? 0 : Math.max(1, post.media?.min_attachments ?? 1)
  // One line under the frame. The day is the column's; the title is the
  // frame's name, which Figma already shows above the frame.
  const note = [platform, typeLabel, day ? time(day.at) : 'Unscheduled', known ? size : `${size} (default size)`].join(' · ')
  const slots: PlannedSlot[] = []
  for (let slot = 0; slot < count; slot++) {
    const of = count > 1 ? ` · ${slot + 1}/${count}` : ''
    slots.push({
      postId: post.id,
      slot,
      width: canvas.width,
      height: canvas.height,
      name: `${title}${of}`,
      legacyName: `${title} · ${platform} ${typeLabel}${of}`,
      note,
    })
  }
  return {
    postId: post.id,
    dayKey: day?.key ?? '',
    dayLabel,
    at: day?.at ?? 0,
    canvasLabel: `${platform} ${typeLabel} · ${size}`,
    attachable: post.attachable,
    slots,
  }
}

// planWeeks spans the campaign's dates and its posts' days, Monday to Sunday.
function planWeeks(days: string[], start: string | undefined, end: string | undefined): PlannedWeek[] {
  const bounds = [...days, start, end].filter((d): d is string => !!d).sort()
  if (bounds.length === 0) return []
  const firstMonday = mondayOf(bounds[0]!)
  const lastMonday = mondayOf(bounds.at(-1)!)
  let mondays: string[] = []
  for (let m = firstMonday; m <= lastMonday && mondays.length <= MAX_EMPTY_SPAN_WEEKS; m = addDays(m, 7)) mondays.push(m)
  if (mondays.length > MAX_EMPTY_SPAN_WEEKS) mondays = [...new Set(days.map(mondayOf))].sort()
  return mondays.map((key, i) => ({
    key,
    label: `Week ${i + 1}\n${rangeLabel(key, addDays(key, 6))}`,
    days: Array.from({ length: 7 }, (_, d) => labelOf(addDays(key, d))),
  }))
}

// Day keys are calendar dates, so they format in UTC.
const labelFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })
const monthDayFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
const yearFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
// The sync time is the viewer's, in their own zone.
const syncedFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })

function utc(dayKey: string): Date {
  return new Date(`${dayKey}T12:00:00Z`)
}

export function labelOf(dayKey: string): string {
  return labelFmt.format(utc(dayKey))
}

// rangeLabel is e.g. "Jun 2 – 8", "Jun 30 – Jul 6" or "Dec 29, 2025 – Jan 4, 2026".
export function rangeLabel(from: string, to: string): string {
  if (from.slice(0, 4) !== to.slice(0, 4)) return `${yearFmt.format(utc(from))} – ${yearFmt.format(utc(to))}`
  if (from.slice(0, 7) === to.slice(0, 7)) return `${monthDayFmt.format(utc(from))} – ${Number(to.slice(8))}`
  return `${monthDayFmt.format(utc(from))} – ${monthDayFmt.format(utc(to))}`
}

function humanize(slug: string): string {
  const s = slug.replace(/[-_]/g, ' ')
  return s[0]!.toUpperCase() + s.slice(1)
}
