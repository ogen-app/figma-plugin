import type { ApiClient } from './client'
import { isRecord, num, rec, str } from './types'

// GET /api/plugins/figma/campaigns (CON-344): the workspace's campaigns
// (archived ones left out) with every post, for the "Send to" tree and the
// campaign boards (CON-354).

export interface CampaignPost {
  id: string
  title: string
  status: string
  platform: { id: string; name: string } | null
  // The platform post type slug ("image-post", "story", …); "" until chosen.
  post_type: string
  scheduled_at: string | null
  attachment_count: number
  // False once the post was submitted for publishing (scheduled or
  // published): it can't take new images.
  attachable: boolean
  // Video rules for this post, resolved from its platform and post type.
  // null: the post can't take a video. undefined: the API doesn't say (no
  // platform yet, or an older server), so nothing is checked.
  video?: VideoRules | null
  // The rules of the post's type on its platform. undefined when unknown.
  media?: PostTypeRule
}

export interface VideoRules {
  // 0 means no limit.
  max_duration_seconds: number
  // Ratios like "9:16"; empty means any.
  allowed_aspect_ratios: string[]
  // 0 means no limit.
  max_per_post: number
}

export interface Canvas {
  width: number
  height: number
}

// PostTypeRule is one post type's media rules on a platform
// (platforms.PostTypeRuleView on the server).
export interface PostTypeRule {
  slug: string
  label: string
  // Attachment kinds the type takes ("image", "video", "pdf"); empty means
  // the rule doesn't restrict kinds.
  allowed_kinds: string[]
  min_attachments: number
  // null means no upper limit.
  max_attachments: number | null
  // The recommended canvas (CON-351); null when the server has none.
  canvas: Canvas | null
}

export interface Campaign {
  id: string
  name: string
  status: string
  // IANA zone the campaign schedules in; "" means UTC.
  timezone: string
  start_date: string | null
  end_date: string | null
  // Latest change to the campaign's posts (CON-353); null when the server
  // doesn't say.
  posts_changed_at: string | null
  posts: CampaignPost[]
}

export async function listCampaigns(api: ApiClient, signal?: AbortSignal): Promise<Campaign[]> {
  const { data } = await api.request('GET', '/campaigns', { signal })
  return toCampaigns(data)
}

// getCampaign fetches one campaign with every post (CON-352), archived ones
// included. A deleted campaign is a 404 with code campaign_not_found.
export async function getCampaign(api: ApiClient, id: string, signal?: AbortSignal): Promise<Campaign> {
  const { data } = await api.request('GET', `/campaigns/${encodeURIComponent(id)}`, { signal })
  const o = rec(data)
  // The campaign may come bare or wrapped as {campaign, platforms}.
  return toCampaign(isRecord(o.campaign) ? o.campaign : o, platformsOf(o))
}

export function toCampaigns(v: unknown): Campaign[] {
  const o = rec(v)
  const list = o.campaigns
  const platforms = platformsOf(o)
  return (Array.isArray(list) ? list : []).map((c) => toCampaign(c, platforms)).filter((c) => c.id !== '')
}

interface PlatformRules {
  video: VideoRules | null
  postTypes: Map<string, PostTypeRule>
}

// platformsOf reads the response's platform rules by platform id. null when
// the response has none (an older server): rules are then unknown.
function platformsOf(o: Record<string, unknown>): Map<string, PlatformRules> | null {
  if (!isRecord(o.platforms)) return null
  const out = new Map<string, PlatformRules>()
  for (const [id, v] of Object.entries(o.platforms)) {
    const p = rec(v)
    const postTypes = new Map<string, PostTypeRule>()
    for (const t of Array.isArray(p.post_types) ? p.post_types : []) {
      const rule = toPostTypeRule(t)
      if (rule) postTypes.set(rule.slug, rule)
    }
    out.set(id, { video: toVideoRules(p.video), postTypes })
  }
  return out
}

function toCampaign(v: unknown, platforms: Map<string, PlatformRules> | null): Campaign {
  const o = rec(v)
  const posts = Array.isArray(o.posts) ? o.posts : []
  return {
    id: str(o.id),
    name: str(o.name),
    status: str(o.status),
    timezone: str(o.timezone),
    start_date: nullableStr(o.start_date),
    end_date: nullableStr(o.end_date),
    posts_changed_at: nullableStr(o.posts_changed_at),
    posts: posts.map((p) => toPost(p, platforms)).filter((p) => p.id !== ''),
  }
}

function toPost(v: unknown, platforms: Map<string, PlatformRules> | null): CampaignPost {
  const o = rec(v)
  const platform = rec(o.platform)
  const post: CampaignPost = {
    id: str(o.id),
    title: str(o.title),
    status: str(o.status),
    platform: platform.id ? { id: str(platform.id), name: str(platform.name) } : null,
    post_type: str(o.post_type),
    scheduled_at: nullableStr(o.scheduled_at),
    attachment_count: num(o.attachment_count, 0),
    attachable: o.attachable === true,
  }
  const rules = post.platform ? platforms?.get(post.platform.id) : undefined
  if (!rules) return post
  const media = rules.postTypes.get(post.post_type)
  if (media) post.media = media
  // A post type that names its kinds and leaves video out can't take one,
  // whatever the platform allows.
  post.video = media && media.allowed_kinds.length > 0 && !media.allowed_kinds.includes('video') ? null : rules.video
  return post
}

function toPostTypeRule(v: unknown): PostTypeRule | null {
  const o = rec(v)
  const slug = str(o.slug)
  if (!slug) return null
  const r = rec(o.rule)
  const kinds = Array.isArray(r.allowed_kinds) ? r.allowed_kinds : []
  const max = r.max_attachments
  return {
    slug,
    label: str(o.label, slug),
    allowed_kinds: kinds.filter((k): k is string => typeof k === 'string'),
    min_attachments: num(r.min_attachments, 0),
    max_attachments: typeof max === 'number' && Number.isFinite(max) ? max : null,
    canvas: toCanvas(o.canvas),
  }
}

function toCanvas(v: unknown): Canvas | null {
  const o = rec(v)
  const width = num(o.width, 0)
  const height = num(o.height, 0)
  return width > 0 && height > 0 ? { width: Math.round(width), height: Math.round(height) } : null
}

function toVideoRules(v: unknown): VideoRules | null {
  if (!isRecord(v)) return null
  const ratios = Array.isArray(v.allowed_aspect_ratios) ? v.allowed_aspect_ratios : []
  return {
    max_duration_seconds: num(v.max_duration_seconds, 0),
    allowed_aspect_ratios: ratios.filter((r): r is string => typeof r === 'string'),
    max_per_post: num(v.max_attachments_per_post, 0),
  }
}

function nullableStr(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null
}
