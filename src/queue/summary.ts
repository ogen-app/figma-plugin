import type { ItemStatus } from './sendQueue'

export interface SendSummary {
  sent: number
  // Of sent: already in Ogen with identical bytes.
  deduplicated: number
  // Of sent: stored in the bank but not attached to the post.
  notAttached: number
  failed: number
  skipped: number
  // open_url of the first asset that reached Ogen.
  openUrl: string | null
}

export function summarize(statuses: ItemStatus[]): SendSummary {
  const s: SendSummary = { sent: 0, deduplicated: 0, notAttached: 0, failed: 0, skipped: 0, openUrl: null }
  for (const st of statuses) {
    switch (st.state) {
      case 'sent':
        s.sent++
        if (st.result.deduplicated) s.deduplicated++
        if (st.attachMessage) s.notAttached++
        s.openUrl ??= st.result.open_url || null
        break
      case 'failed':
        s.failed++
        break
      case 'skipped':
        s.skipped++
        break
    }
  }
  return s
}

// headline is the one-line result, e.g. "3 sent · 1 already in Ogen · 1 failed".
export function headline(s: SendSummary): string {
  const parts: string[] = []
  const fresh = s.sent - s.deduplicated
  if (fresh > 0) parts.push(`${fresh} sent`)
  if (s.deduplicated > 0) parts.push(`${s.deduplicated} already in Ogen`)
  if (s.notAttached > 0) parts.push(`${s.notAttached} not attached`)
  if (s.failed > 0) parts.push(`${s.failed} failed`)
  if (s.skipped > 0) parts.push(`${s.skipped} not sent`)
  return parts.join(' · ') || 'Nothing was sent'
}
