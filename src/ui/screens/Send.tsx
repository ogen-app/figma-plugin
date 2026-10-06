import { useEffect, useState } from 'preact/hooks'
import type { ApiClient } from '../../api/client'
import type { PluginPost } from '../../api/posts'
import { DEFAULT_LIMITS, type Me } from '../../api/types'
import type { SendRequest } from '../../queue/types'
import type { ExportFormat, Scale } from '../../shared/messages'
import type { Bridge } from '../bridge'
import { Header } from '../components/Header'
import { PostPicker } from '../components/PostPicker'
import { Segmented } from '../components/Segmented'
import { SelectionList } from '../components/SelectionList'
import { useSelection } from '../hooks/useSelection'
import { pixelWarning } from '../../queue/preflight'
import { DEFAULT_PREFS, type Prefs, type Store, type StoredSession } from '../storage'

const FORMATS = [
  { value: 'PNG', label: 'PNG' },
  { value: 'JPG', label: 'JPG' },
] as const satisfies ReadonlyArray<{ value: ExportFormat; label: string }>

const SCALES = [
  { value: 1, label: '1×' },
  { value: 2, label: '2×' },
  { value: 3, label: '3×' },
] as const satisfies ReadonlyArray<{ value: Scale; label: string }>

export interface SendScreenProps {
  bridge: Bridge
  api: ApiClient
  store: Store
  session: StoredSession
  me: Me | null
  onDisconnect: () => void
  onSend: (request: SendRequest) => void
}

export function SendScreen({ bridge, api, store, session, me, onDisconnect, onSend }: SendScreenProps) {
  const selection = useSelection(bridge)
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)
  const [toPost, setToPost] = useState(false)
  const [post, setPost] = useState<PluginPost | null>(null)
  const limits = me?.limits ?? DEFAULT_LIMITS

  useEffect(() => {
    void store.loadPrefs().then(setPrefs, () => undefined)
  }, [store])

  function updatePrefs(patch: Partial<Prefs>) {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    void store.savePrefs(next).catch(() => undefined)
  }

  const { items } = selection
  const oversized = items.filter((i) => pixelWarning(i, prefs.scale, limits)).length
  const sendable = items.length - oversized
  const blocked = sendable === 0 || (toPost && !post)

  function send() {
    onSend({
      items: items.filter((i) => !pixelWarning(i, prefs.scale, limits)),
      format: prefs.format,
      scale: prefs.scale,
      destination: toPost && post ? { kind: 'post', post } : { kind: 'bank' },
    })
  }

  return (
    <main class="screen send">
      <Header workspaceName={me?.workspace.name || session.workspace.name} userName={session.user.name} onDisconnect={onDisconnect} />

      <section class="list-area" aria-label="Selected frames">
        <SelectionList {...selection} scale={prefs.scale} limits={limits} />
      </section>

      <section class="options">
        <div class="row">
          <Segmented label="Format" value={prefs.format} options={FORMATS} onChange={(format) => updatePrefs({ format })} />
          <Segmented label="Scale" value={prefs.scale} options={SCALES} onChange={(scale) => updatePrefs({ scale })} />
        </div>
        <Segmented
          label="Send to"
          value={toPost ? 'post' : 'bank'}
          options={[
            { value: 'bank', label: 'Content bank' },
            { value: 'post', label: 'Draft post…' },
          ]}
          onChange={(v) => setToPost(v === 'post')}
        />
        {toPost && <PostPicker api={api} selected={post} onSelect={setPost} />}
      </section>

      <footer class="footer">
        {oversized > 0 && (
          <p class="warning small">
            {oversized} of {items.length} {oversized === 1 ? 'frame is' : 'frames are'} too large and will be skipped.
          </p>
        )}
        <button class="primary wide" disabled={blocked} onClick={send}>
          {sendButtonLabel(sendable, toPost)}
        </button>
      </footer>
    </main>
  )
}

function sendButtonLabel(n: number, toPost: boolean) {
  if (n === 0) return 'Send'
  const what = n === 1 ? '1 frame' : `${n} frames`
  return toPost ? `Send ${what} to post` : `Send ${what}`
}
