import type { ApiClient } from './client'
import { num, rec, str } from './types'

export interface PluginPost {
  id: string
  title: string
  status: string
  platform: string
  campaign: { id: string; name: string } | null
  updated_at: string
  attachment_count: number
}

export const POSTS_PAGE_SIZE = 20

// listPosts returns the posts a frame can still be attached to (not yet
// submitted for publishing), newest edit first, filtered by title.
export async function listPosts(api: ApiClient, q: string, signal?: AbortSignal): Promise<PluginPost[]> {
  const params = new URLSearchParams({ limit: String(POSTS_PAGE_SIZE) })
  if (q.trim()) params.set('q', q.trim())
  const { data } = await api.request('GET', `/posts?${params}`, { signal })
  const posts = rec(data).posts
  return (Array.isArray(posts) ? posts : []).map(toPost).filter((p) => p.id !== '')
}

export function toPost(v: unknown): PluginPost {
  const o = rec(v)
  const campaign = rec(o.campaign)
  return {
    id: str(o.id),
    title: str(o.title),
    status: str(o.status),
    platform: str(o.platform),
    campaign: campaign.id ? { id: str(campaign.id), name: str(campaign.name) } : null,
    updated_at: str(o.updated_at),
    attachment_count: num(o.attachment_count, 0),
  }
}
