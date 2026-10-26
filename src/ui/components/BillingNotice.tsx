import { BILLING_HINT, BILLING_MESSAGE, BILLING_OWNER_NOTE } from '../../queue/errors'

// BillingNotice stands in for a screen's body while the workspace has no plan
// (CON-409). Retrying is pointless until the owner checks out, so it offers
// "Check again" rather than Retry.
export function BillingNotice({ onCheckAgain, inset = false }: { onCheckAgain?: () => void; inset?: boolean }) {
  return (
    <div class={`banner billing${inset ? ' inset' : ''}`} role="alert">
      <p>{BILLING_MESSAGE}</p>
      <button class="link" onClick={() => window.open(BILLING_HINT.url, '_blank', 'noopener')}>
        {BILLING_HINT.text} ↗
      </button>
      <p class="muted small">{BILLING_OWNER_NOTE}</p>
      {onCheckAgain && (
        <button class="link" onClick={onCheckAgain}>
          Check again
        </button>
      )}
    </div>
  )
}
