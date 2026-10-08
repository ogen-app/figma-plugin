import type { VideoRules } from '../api/campaigns'
import type { ExportFormat, Scale, SelectionItem, VideoFormat, VideoQuality, VideoScale } from '../shared/messages'

// PostTarget is the campaign post a send attaches to, as the picker showed it.
export interface PostTarget {
  id: string
  title: string
  campaignName: string
  platformName: string
  // The post's video rules from the campaigns API, for pre-flight warnings.
  video?: VideoRules | null
  // e.g. "Story · Mon, Jun 3, 09:00", for a board's linked post.
  detail?: string
  // False once the post was submitted: it can't take new media.
  attachable?: boolean
  // The post type's attachment cap; null or undefined means none known.
  maxAttachments?: number | null
}

export type Destination = { kind: 'bank' } | { kind: 'post'; post: PostTarget }

export interface VideoOptions {
  format: VideoFormat
  quality: VideoQuality
  scale: VideoScale
}

export interface SendRequest {
  items: SelectionItem[]
  format: ExportFormat
  scale: Scale
  // Where items without their own post go.
  destination: Destination
  // Board placeholders' own posts, by item id (CON-354): these items go to
  // their post whatever the destination.
  linked?: Record<string, PostTarget>
  // Set to send each item's animation as a video instead of an image. Only a
  // post takes video.
  video?: VideoOptions
}

// targetOf is the post an item goes to, or null for the content bank.
export function targetOf(request: SendRequest, item: SelectionItem): PostTarget | null {
  return request.linked?.[item.id] ?? (request.destination.kind === 'post' ? request.destination.post : null)
}
