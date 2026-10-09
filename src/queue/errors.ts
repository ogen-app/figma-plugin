import { isApiError } from '../api/client'
import { rec, str } from '../api/types'

// Readable text for the server's reject codes (CON-338 §9 and the content
// bank's upload codes).
const MESSAGES: Record<string, string> = {
  too_large: 'The image is over the upload size limit. Try JPG or a lower scale.',
  empty_file: 'Figma exported an empty image.',
  invalid_file: 'Ogen could not read the exported image.',
  vector_rejected: 'SVG is not supported. Send as PNG or JPG.',
  unsupported_media_type: 'Only PNG and JPG images can be sent.',
  extension_not_allowed: 'Only PNG and JPG images can be sent.',
  dimensions_exceeded: 'The image has too many pixels. Try a lower scale.',
  quota_exceeded: 'Your workspace has reached its storage limit.',
  feature_not_available: "Your plan doesn't include this.",
  service_unavailable: 'Ogen is temporarily unavailable. Try again shortly.',
  internal_error: 'Something went wrong in Ogen. Try again.',
  network_error: 'Could not reach Ogen. Check your connection.',
  // A failed PUT to a presigned storage URL: the API may be fine while
  // storage is unreachable or refuses the request (e.g. a CORS preflight).
  storage_network_error: 'Could not reach Ogen storage. Check your connection.',
  plugin_token_invalid: 'Disconnected from Ogen.',
  post_not_found: 'The post no longer exists in this workspace.',
  post_locked: "The post was already sent for publishing and can't take new images.",
}

const QUOTA_FEATURES: Record<string, string> = {
  content_bank_assets: 'content bank',
  media_storage_bytes: 'media storage',
}

export const UPGRADE_HINT = 'Upgrade your plan in Ogen to send more.'

export function codeMessage(code: string | undefined, fallback: string): string {
  return (code && MESSAGES[code]) || fallback
}

// errorMessage turns any failure into one sentence for the item list.
export function errorMessage(err: unknown): string {
  if (isApiError(err)) {
    if (err.status === 402 || err.code === 'entitlement_exceeded') return quotaMessage(err.body)
    if (err.status === 429) return 'Ogen is rate limiting this plugin. Try again in a minute.'
    return codeMessage(err.code, err.status >= 500 ? MESSAGES.internal_error! : err.message)
  }
  return err instanceof Error ? err.message : 'Something went wrong.'
}

function quotaMessage(body: unknown): string {
  const feature = QUOTA_FEATURES[str(rec(body).feature)]
  return feature ? `Your workspace has reached its ${feature} limit.` : 'Your workspace has reached a plan limit.'
}

// upgradeHint is the server's upgrade pointer when it sends one, else a
// generic nudge.
export function upgradeHint(err: unknown): { text: string; url?: string } {
  const url = isApiError(err) ? str(rec(err.body).upgrade_url) : ''
  return url ? { text: 'Upgrade your plan', url } : { text: UPGRADE_HINT }
}
