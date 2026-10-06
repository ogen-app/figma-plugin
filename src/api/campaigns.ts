import type { ApiClient } from './client'
import { num, rec, str } from './types'

// GET /api/plugins/figma/campaigns (CON-344): the workspace's campaigns
// (archived ones left out) with every post, for the "Send to" tree.

export interface CampaignPost {
  id: string
  title: string
  status: string
  platform: { id: string; name: string } | null
  scheduled_at: string | null
  attachment_count: number
  // False once the post was submitted for publishing (scheduled or
  // published): it can't take new images.
  attachable: boolean
}

export interface Campaign {
  id: string
  name: string
  status: string
  // IANA zone the campaign schedules in; "" means UTC.
  timezone: string
  start_date: string | null
  end_date: string | null
  posts: CampaignPost[]
}

export async function listCampaigns(api: ApiClient, signal?: AbortSignal): Promise<Campaign[]> {
  const { data } = await api.request('GET', '/campaigns', { signal })
  return toCampaigns(data)
}

export function toCampaigns(v: unknown): Campaign[] {
  const list = rec(v).campaigns
  return (Array.isArray(list) ? list : []).map(toCampaign).filter((c) => c.id !== '')
}

function toCampaign(v: unknown): Campaign {
  const o = rec(v)
  const posts = Array.isArray(o.posts) ? o.posts : []
  return {
    id: str(o.id),
    name: str(o.name),
    status: str(o.status),
    timezone: str(o.timezone),
    start_date: nullableStr(o.start_date),
    end_date: nullableStr(o.end_date),
    posts: posts.map(toPost).filter((p) => p.id !== ''),
  }
}

function toPost(v: unknown): CampaignPost {
  const o = rec(v)
  const platform = rec(o.platform)
  return {
    id: str(o.id),
    title: str(o.title),
    status: str(o.status),
    platform: platform.id ? { id: str(platform.id), name: str(platform.name) } : null,
    scheduled_at: nullableStr(o.scheduled_at),
    attachment_count: num(o.attachment_count, 0),
    attachable: o.attachable === true,
  }
}

function nullableStr(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null
}
