import { useEffect, useRef, useState } from 'preact/hooks'
import { isApiError, type ApiClient } from '../../api/client'
import { clientLabel, startPairing, waitForApproval } from '../../api/pairing'
import type { DocInfo } from '../app'
import { Logo } from '../components/Logo'
import type { StoredSession } from '../storage'

export interface ConnectScreenProps {
  notice?: string
  doc: DocInfo
  api: ApiClient
  onConnected: (session: StoredSession) => Promise<void>
}

type State =
  | { kind: 'idle'; error?: string }
  | { kind: 'starting' }
  | { kind: 'waiting'; approveUrl: string }

export function ConnectScreen({ notice, doc, api, onConnected }: ConnectScreenProps) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  async function connect() {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setState({ kind: 'starting' })
    try {
      const start = await startPairing(api, clientLabel(doc.userName))
      if (ctrl.signal.aborted) return
      window.open(start.approve_url, '_blank')
      setState({ kind: 'waiting', approveUrl: start.approve_url })
      const outcome = await waitForApproval(api, start, { signal: ctrl.signal })
      switch (outcome.kind) {
        case 'approved':
          await onConnected(outcome.session)
          return
        case 'denied':
          setState({ kind: 'idle', error: 'The connection was declined in Ogen.' })
          return
        case 'expired':
          setState({ kind: 'idle', error: 'The connection request expired. Try again.' })
          return
        case 'cancelled':
          setState({ kind: 'idle' })
          return
      }
    } catch (err) {
      if (ctrl.signal.aborted) return
      setState({ kind: 'idle', error: connectErrorMessage(err) })
    }
  }

  function cancel() {
    abortRef.current?.abort()
    setState({ kind: 'idle' })
  }

  if (state.kind === 'waiting') {
    return (
      <main class="screen center">
        <div class="spinner" aria-hidden="true" />
        <h1>Waiting for approval in your browser…</h1>
        <p class="muted">Sign in to Ogen if asked, pick a workspace and click Allow.</p>
        <button class="link" onClick={() => window.open(state.approveUrl, '_blank')}>
          Open the approval page again
        </button>
        <button onClick={cancel}>Cancel</button>
      </main>
    )
  }

  const error = state.kind === 'idle' ? state.error : undefined
  return (
    <main class="screen center">
      <Logo size={48} />
      <h1>Send frames to Ogen</h1>
      <p class="muted">Connect this plugin to your Ogen workspace once, then send selected frames in one click.</p>
      {notice && !error && <p class="notice">{notice}</p>}
      {error && (
        <p class="notice error" role="alert">
          {error}
        </p>
      )}
      <button class="primary" onClick={connect} disabled={state.kind === 'starting'}>
        {state.kind === 'starting' ? 'Connecting…' : 'Connect to Ogen'}
      </button>
    </main>
  )
}

function connectErrorMessage(err: unknown): string {
  if (isApiError(err)) {
    if (err.status === 429) return 'Too many connection attempts. Wait a minute and try again.'
    if (err.status === 0) return err.message
    return `Could not start the connection: ${err.message}`
  }
  return err instanceof Error ? err.message : 'Could not start the connection.'
}
