import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { createApiClient, isApiError } from '../api/client'
import { sendImage } from '../api/images'
import { sendVideo } from '../api/videos'
import { DEFAULT_LIMITS, type Me } from '../api/types'
import { runSendQueue, type ItemStatus, type QueueOutcome } from '../queue/sendQueue'
import { headline, summarize } from '../queue/summary'
import type { SendRequest } from '../queue/types'
import type { LaunchCommand } from '../shared/messages'
import { sleep } from '../queue/sleep'
import type { Bridge } from './bridge'
import { Header, type Tab } from './components/Header'
import { BoardsScreen } from './screens/Boards'
import { ConnectScreen } from './screens/Connect'
import { SendScreen } from './screens/Send'
import { ResultScreen } from './screens/Result'
import { SendingScreen } from './screens/Sending'
import { createStore, type StoredSession } from './storage'

export const DISCONNECTED_NOTICE = 'Disconnected from Ogen.'

export interface DocInfo {
  userName: string | null
  fileName: string
  command: LaunchCommand
  // The current page's board when the plugin opened on one.
  board: { campaignId: string; copy: boolean } | null
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
  const [doc, setDoc] = useState<DocInfo>({ userName: null, fileName: '', command: '', board: null })
  const [tab, setTab] = useState<Tab>('send')
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
      if (msg.type === 'init') {
        setDoc({ userName: msg.userName, fileName: msg.fileName, command: msg.command, board: msg.board })
        setTab(launchTab(msg.command, msg.board !== null))
      }
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
    setView({ name: 'send', session, me: null })
    // The pairing is single-collect, so the token can't be fetched again:
    // keep using it even if it can't be persisted, and say so.
    await services.store.saveSession(session).catch(() =>
      bridge.send({
        type: 'notify',
        message: "Connected, but the connection couldn't be saved. You may need to connect again next time.",
        error: true,
      }),
    )
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
        exportVideo: (item, video) =>
          bridge.call('exportVideo', { nodeId: item.id, format: video.format, quality: video.quality, scale: video.scale }),
        uploadVideo: (input, signal) => sendVideo(services.api, input, signal),
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
    setView((v) => {
      if (v.name !== 'sending' || v.request !== request) return v
      const summary = summarize(v.statuses)
      bridge.send({ type: 'notify', message: headline(summary), error: summary.sent === 0 })
      markBoardFrames(request, v.statuses)
      return { ...v, outcome }
    })
  }

  // markBoardFrames notes on the board which placeholders reached their post.
  function markBoardFrames(request: SendRequest, statuses: ItemStatus[]) {
    if (!request.linked) return
    const nodeIds = request.items
      .filter((item, i) => {
        const st = statuses[i]
        return request.linked?.[item.id] && st?.state === 'sent'
      })
      .map((item) => item.id)
    if (nodeIds.length === 0) return
    const label = `✓ Sent ${sentFmt.format(new Date())}`
    bridge.call('markSent', { nodeIds, label }).catch(() => undefined)
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
        <main class="screen send">
          <Header
            workspaceName={view.me?.workspace.name || view.session.workspace.name}
            userName={view.session.user.name}
            tab={tab}
            onTab={setTab}
            onDisconnect={disconnect}
          />
          {tab === 'send' ? (
            <SendScreen bridge={bridge} api={services.api} store={services.store} me={view.me} onSend={send} />
          ) : (
            <BoardsScreen bridge={bridge} api={services.api} workspaceId={view.me?.workspace.id || view.session.workspace.id} current={doc.board} />
          )}
        </main>
      )
    case 'sending':
      return view.outcome ? (
        <ResultScreen request={view.request} statuses={view.statuses} outcome={view.outcome} onBack={backToSend} />
      ) : (
        <SendingScreen request={view.request} statuses={view.statuses} onCancel={() => sendAbort.current?.abort()} />
      )
  }
}

const sentFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })

// launchTab picks the tab for how the plugin was opened: a menu command or
// relaunch button names it; otherwise a board page opens on Boards.
export function launchTab(command: LaunchCommand, onBoard: boolean): Tab {
  if (command) return command
  return onBoard ? 'boards' : 'send'
}
