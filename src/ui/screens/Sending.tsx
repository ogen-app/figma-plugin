import type { ItemStatus } from '../../queue/sendQueue'
import type { SendRequest } from '../../queue/types'
import { StatusList } from '../components/StatusList'

export interface SendingScreenProps {
  request: SendRequest
  statuses: ItemStatus[]
  onCancel: () => void
}

export function SendingScreen({ request, statuses, onCancel }: SendingScreenProps) {
  const finished = statuses.filter((s) => s.state === 'sent' || s.state === 'failed' || s.state === 'skipped').length
  const total = request.items.length
  return (
    <main class="screen send">
      <header class="header">
        <div class="header-title">
          <strong>
            Sending {Math.min(finished + 1, total)} of {total}…
          </strong>
        </div>
      </header>
      <div class="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={finished}>
        <div class="progress-bar" style={{ width: `${(finished / total) * 100}%` }} />
      </div>
      <section class="list-area" aria-live="polite">
        <StatusList items={request.items} statuses={statuses} />
      </section>
      <footer class="footer">
        <button class="wide" onClick={onCancel}>
          Cancel
        </button>
      </footer>
    </main>
  )
}
