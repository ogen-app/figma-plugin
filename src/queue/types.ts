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
  destination: Destination
  // Set to send each item's animation as a video instead of an image. Only a
  // post destination takes video.
  video?: VideoOptions
}
