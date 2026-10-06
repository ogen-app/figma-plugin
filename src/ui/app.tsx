import { useEffect, useMemo, useState } from 'preact/hooks'
import { createApiClient, isApiError } from '../api/client'
import type { Me } from '../api/types'
import type { Bridge } from './bridge'
import { ConnectScreen } from './screens/Connect'
import { SendScreen } from './screens/Send'
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

export function App({ bridge }: { bridge: Bridge }) {
  const [view, setView] = useState<View>({ name: 'loading' })
  const [doc, setDoc] = useState<DocInfo>({ userName: null, fileName: '' })

  const services = useMemo(() => {
    const store = createStore(bridge)
    const auth = { token: null as string | null }
    const disconnect = async (notice?: string) => {
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

  switch (view.name) {
    case 'loading':
      return <main class="screen center muted">Loading…</main>
    case 'connect':
      return <ConnectScreen notice={view.notice} doc={doc} api={services.api} onConnected={connected} />
    case 'send':
      return <SendScreen session={view.session} me={view.me} />
  }
}
