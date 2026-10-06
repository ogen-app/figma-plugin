import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { createApiClient, isApiError } from '../api/client'
import { sendImage } from '../api/images'
import { DEFAULT_LIMITS, type Me } from '../api/types'
import { runSendQueue, type ItemStatus, type QueueOutcome } from '../queue/sendQueue'
import type { SendRequest } from '../queue/types'
import { sleep } from '../queue/sleep'
import type { Bridge } from './bridge'
import { ConnectScreen } from './screens/Connect'
import { SendScreen } from './screens/Send'
import { SendingScreen } from './screens/Sending'
import { createStore, type StoredSession } from './storage'

export const DISCONNECTED_NOTICE = 'Disconnected from Ogen.'

export interface DocInfo {
  userName: string | null
  fileName: string
}

type View =
  | { name: 'loading' }
  | { name: 'connect'; notice?: string }
  | { name: 'send'; session: StoredSession; me: Me | null }
  | {
      name: 'sending'
      session: StoredSession
      me: Me | null
      request: SendRequest
      statuses: ItemStatus[]
      outcome: QueueOutcome | null
    }

export function App({ bridge }: { bridge: Bridge }) {
  const [view, setView] = useState<View>({ name: 'loading' })
  const [doc, setDoc] = useState<DocInfo>({ userName: null, fileName: '' })
  const sendAbort = useRef<AbortController | null>(null)

  const services = useMemo(() => {
    const store = createStore(bridge)
    const auth = { token: null as string | null }
    const disconnect = async (notice?: string) => {
      sendAbort.current?.abort()
      auth.token = null
      await store.clearSession().catch(() => undefined)
      setView({ name: 'connect', notice })
    }
    const api = createApiClient({
      baseUrl: __API_BASE__,
      getToken: () => auth.token,
      onUnauthorized: () => void disconnect(DISCONNECTED_NOTICE),
    })
    return { store, auth, api, disconnect }
  }, [bridge])

  useEffect(() => {
    const unsubscribe = bridge.subscribe((msg) => {
      if (msg.type === 'init') setDoc({ userName: msg.userName, fileName: msg.fileName })
    })
    bridge.send({ type: 'ready' })
    void restoreSession()
    return unsubscribe
  }, [bridge])

  async function restoreSession() {
    const session = await services.store.loadSession().catch(() => null)
    if (!session) {
      setView({ name: 'connect' })
      return
    }
    services.auth.token = session.token
    let me: Me | null = null
    try {
      me = await services.api.me()
    } catch (err) {
      // A 401 already moved us to Connect; anything else (offline, 5xx) keeps
      // the stored connection and lets the send itself report the problem.
      if (isApiError(err) && err.status === 401) return
    }
    setView({ name: 'send', session, me })
  }

  async function connected(session: StoredSession) {
    services.auth.token = session.token
    await services.store.saveSession(session)
    setView({ name: 'send', session, me: null })
    const me = await services.api.me().catch(() => null)
    setView((v) => (v.name === 'send' && v.session.token === session.token ? { ...v, me } : v))
  }

  async function disconnect() {
    // Best effort: a failed revoke still disconnects this install; the
    // connection stays listed in Ogen settings, where it can be revoked.
    await services.api.revokeToken().catch(() => undefined)
    await services.disconnect()
  }

  async function send(request: SendRequest) {
    if (view.name !== 'send') return
    const { session, me } = view
    const ctrl = new AbortController()
    sendAbort.current = ctrl
    setView({ name: 'sending', session, me, request, statuses: request.items.map(() => ({ state: 'queued' })), outcome: null })

    const outcome = await runSendQueue(
      request,
      {
        exportNode: (item, format, scale) => bridge.call('exportNode', { nodeId: item.id, format, scale }),
        upload: (input, signal) => sendImage(services.api, input, signal),
        sleep,
        limits: me?.limits ?? DEFAULT_LIMITS,
      },
      (index, status) =>
        setView((v) => {
          if (v.name !== 'sending' || v.request !== request) return v
          const statuses = v.statuses.slice()
          statuses[index] = status
          return { ...v, statuses }
        }),
      ctrl.signal,
    )
    // On 401 the client already moved us to Connect.
    if (outcome.kind === 'unauthorized') return
    setView((v) => (v.name === 'sending' && v.request === request ? { ...v, outcome } : v))
  }

  function backToSend() {
    setView((v) => (v.name === 'sending' ? { name: 'send', session: v.session, me: v.me } : v))
  }

  switch (view.name) {
    case 'loading':
      return <main class="screen center muted">Loading…</main>
    case 'connect':
      return <ConnectScreen notice={view.notice} doc={doc} api={services.api} onConnected={connected} />
    case 'send':
      return (
        <SendScreen
          bridge={bridge}
          api={services.api}
          store={services.store}
          session={view.session}
          me={view.me}
          onDisconnect={disconnect}
          onSend={send}
        />
      )
    case 'sending':
      return (
        <SendingScreen
          request={view.request}
          statuses={view.statuses}
          outcome={view.outcome}
          onCancel={() => sendAbort.current?.abort()}
          onDone={backToSend}
        />
      )
  }
}
