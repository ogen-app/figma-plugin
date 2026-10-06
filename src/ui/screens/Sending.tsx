import type { ItemStatus, QueueOutcome } from '../../queue/sendQueue'
import type { SendRequest } from '../../queue/types'
import { StatusList } from '../components/StatusList'

export interface SendingScreenProps {
  request: SendRequest
  statuses: ItemStatus[]
  outcome: QueueOutcome | null
  onCancel: () => void
  onDone: () => void
}

export function SendingScreen({ request, statuses, outcome, onCancel, onDone }: SendingScreenProps) {
  const finished = statuses.filter((s) => s.state === 'sent' || s.state === 'failed' || s.state === 'skipped').length
  return (
    <main class="screen send">
      <header class="header">
        <div class="header-title">
          <strong>{outcome ? 'Done' : `Sending ${Math.min(finished + 1, request.items.length)} of ${request.items.length}…`}</strong>
        </div>
      </header>
      <section class="list-area" aria-live="polite">
        <StatusList items={request.items} statuses={statuses} />
      </section>
      <footer class="footer">
        {outcome ? (
          <button class="primary wide" onClick={onDone}>
            Done
          </button>
        ) : (
          <button class="wide" onClick={onCancel}>
            Cancel
          </button>
        )}
      </footer>
    </main>
  )
}
