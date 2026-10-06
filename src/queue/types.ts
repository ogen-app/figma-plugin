import type { ExportFormat, Scale, SelectionItem } from '../shared/messages'

// PostTarget is the campaign post a send attaches to, as the picker showed it.
export interface PostTarget {
  id: string
  title: string
  campaignName: string
  platformName: string
}

export type Destination = { kind: 'bank' } | { kind: 'post'; post: PostTarget }

export interface SendRequest {
  items: SelectionItem[]
  format: ExportFormat
  scale: Scale
  destination: Destination
}
