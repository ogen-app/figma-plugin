import { isHttpUrl } from '../../api/pairing'
import type { ItemStatus, QueueOutcome } from '../../queue/sendQueue'
import { headline, summarize } from '../../queue/summary'
import { targetOf, type SendRequest } from '../../queue/types'
import { StatusList } from '../components/StatusList'

export interface ResultScreenProps {
  request: SendRequest
  statuses: ItemStatus[]
  outcome: QueueOutcome
  onBack: () => void
}

export function ResultScreen({ request, statuses, outcome, onBack }: ResultScreenProps) {
  const summary = summarize(statuses)
  const openUrl = summary.openUrl && isHttpUrl(summary.openUrl) ? summary.openUrl : null
  const where = destinationLabel(request)

  return (
    <main class="screen send">
      <header class="header">
        <div class="header-title">
          <strong>{headline(summary)}</strong>
          {summary.sent > 0 && <span class="muted">{where}</span>}
        </div>
      </header>

      {outcome.kind === 'quota' && (
        <div class="banner" role="alert">
          <p>{outcome.message}</p>
          {outcome.hint.url && isHttpUrl(outcome.hint.url) ? (
            <button class="link" onClick={() => window.open(outcome.hint.url, '_blank')}>
              {outcome.hint.text} ↗
            </button>
          ) : (
            <p class="muted">{outcome.hint.text}</p>
          )}
        </div>
      )}
      {outcome.kind === 'cancelled' && (
        <div class="banner">
          <p>Sending was cancelled. Frames already sent stay in Ogen.</p>
        </div>
      )}

      <section class="list-area" aria-label="Results">
        <StatusList items={request.items} statuses={statuses} />
      </section>

      <footer class="footer">
        {openUrl && (
          <button class="primary wide" onClick={() => window.open(openUrl, '_blank')}>
            Open in Ogen ↗
          </button>
        )}
        <button class="wide" onClick={onBack}>
          Send more
        </button>
      </footer>
    </main>
  )
}

function destinationLabel(request: SendRequest): string {
  const posts = new Map(request.items.map((item) => [targetOf(request, item)?.id ?? '', targetOf(request, item)]))
  const bank = posts.delete('')
  const n = posts.size === 1 ? '1 post' : `${posts.size} posts`
  if (posts.size > 1 || (posts.size === 1 && bank)) return bank ? `to ${n} and the content bank` : `to ${n}`
  const post = [...posts.values()][0]
  if (!post) return 'to the content bank'
  return `to “${post.title || 'Untitled post'}”${post.campaignName ? ` in ${post.campaignName}` : ''}`
}
