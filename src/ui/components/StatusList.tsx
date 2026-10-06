import type { ItemStatus } from '../../queue/sendQueue'
import type { SelectionItem } from '../../shared/messages'

export interface StatusListProps {
  items: SelectionItem[]
  statuses: ItemStatus[]
}

export function StatusList({ items, statuses }: StatusListProps) {
  return (
    <ul class="items">
      {items.map((item, i) => {
        const status = statuses[i] ?? { state: 'queued' }
        const { icon, tone, text } = describe(status)
        return (
          <li key={item.id} class="item">
            <span class={`status-icon ${tone}`} aria-hidden="true">
              {icon}
            </span>
            <div class="item-body">
              <div class="item-name" title={item.name}>
                {item.name}
              </div>
              {text && <div class={`small ${tone === 'muted' ? 'muted' : tone}`}>{text}</div>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function describe(s: ItemStatus): { icon: string; tone: 'muted' | 'success' | 'warning' | 'danger'; text: string } {
  switch (s.state) {
    case 'queued':
      return { icon: '○', tone: 'muted', text: 'Waiting' }
    case 'exporting':
      return { icon: '◐', tone: 'muted', text: 'Exporting from Figma…' }
    case 'rendering':
      return { icon: '◐', tone: 'muted', text: 'Rendering video in Figma…' }
    case 'uploading':
      return { icon: '◑', tone: 'muted', text: 'Uploading…' }
    case 'waiting':
      return { icon: '◔', tone: 'muted', text: 'Ogen asked us to slow down, retrying shortly…' }
    case 'sent':
      if ('kind' in s.result) {
        if (s.platformIssues) return { icon: '!', tone: 'warning', text: `Attached, but: ${s.platformIssues}` }
        return { icon: '✓', tone: 'success', text: 'Video attached' }
      }
      if (s.attachMessage) return { icon: '!', tone: 'warning', text: `In the content bank, not attached: ${s.attachMessage}` }
      if (s.result.deduplicated) return { icon: '✓', tone: 'success', text: 'Already in Ogen' }
      return { icon: '✓', tone: 'success', text: s.result.attachment ? 'Sent and attached' : 'Sent' }
    case 'failed':
      return { icon: '✕', tone: 'danger', text: s.message }
    case 'skipped':
      return { icon: '–', tone: 'muted', text: s.message }
  }
}
