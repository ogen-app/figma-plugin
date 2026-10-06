import type { PluginPost } from '../api/posts'
import type { ExportFormat, Scale, SelectionItem } from '../shared/messages'

export type Destination = { kind: 'bank' } | { kind: 'post'; post: PluginPost }

export interface SendRequest {
  items: SelectionItem[]
  format: ExportFormat
  scale: Scale
  destination: Destination
}
