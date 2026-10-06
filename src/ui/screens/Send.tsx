import { useEffect, useState } from 'preact/hooks'
import type { ApiClient } from '../../api/client'
import { DEFAULT_LIMITS, type Me } from '../../api/types'
import type { PostTarget, SendRequest } from '../../queue/types'
import { isVideoExportable, type ExportFormat, type Scale, type VideoFormat, type VideoQuality, type VideoScale } from '../../shared/messages'
import type { Bridge } from '../bridge'
import { Header } from '../components/Header'
import { CampaignPicker } from '../components/CampaignPicker'
import { Segmented } from '../components/Segmented'
import { SelectionList } from '../components/SelectionList'
import { useSelection } from '../hooks/useSelection'
import { pixelWarning } from '../../queue/preflight'
import { DEFAULT_PREFS, type Prefs, type Store, type StoredSession } from '../storage'

const DEFAULT_HEIGHT = 540
const TALL_HEIGHT = 700

const FORMATS = [
  { value: 'PNG', label: 'PNG' },
  { value: 'JPG', label: 'JPG' },
] as const satisfies ReadonlyArray<{ value: ExportFormat; label: string }>

const VIDEO_FORMATS = [
  { value: 'MP4', label: 'MP4' },
  { value: 'WEBM', label: 'WebM' },
] as const satisfies ReadonlyArray<{ value: VideoFormat; label: string }>

const VIDEO_QUALITIES = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
] as const satisfies ReadonlyArray<{ value: VideoQuality; label: string }>

const VIDEO_SCALES = [
  { value: 1, label: '1×' },
  { value: 2, label: '2×' },
] as const satisfies ReadonlyArray<{ value: VideoScale; label: string }>

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
  const [post, setPost] = useState<PostTarget | null>(null)
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
  const animatedCount = items.filter(isVideoExportable).length
  // Video stays chosen while the selection has nothing to animate, but
  // sends images until it does.
  const video = prefs.video && animatedCount > 0
  const sendTo = video || toPost ? 'post' : 'bank'
  const target = sendTo === 'post' ? post : null

  // The campaign tree needs room; grow the window while it's open.
  const picking = sendTo === 'post' && !post
  useEffect(() => {
    bridge.send({ type: 'resize', height: picking ? TALL_HEIGHT : DEFAULT_HEIGHT })
  }, [bridge, picking])
  useEffect(() => () => bridge.send({ type: 'resize', height: DEFAULT_HEIGHT }), [bridge])

  const oversized = video ? 0 : items.filter((i) => pixelWarning(i, prefs.scale, limits)).length
  const notAnimated = video ? items.length - animatedCount : 0
  const sendable = items.length - oversized - notAnimated
  // A post picked in image mode may not take video; keep it picked so
  // switching back to images still works, but don't send video to it.
  const postRefusesVideo = video && post?.video === null
  const blocked = sendable === 0 || (sendTo === 'post' && !post) || postRefusesVideo

  function send() {
    onSend({
      items: video ? items.filter(isVideoExportable) : items.filter((i) => !pixelWarning(i, prefs.scale, limits)),
      format: prefs.format,
      scale: prefs.scale,
      destination: sendTo === 'post' && post ? { kind: 'post', post } : { kind: 'bank' },
      ...(video ? { video: { format: prefs.videoFormat, quality: prefs.videoQuality, scale: prefs.videoScale } } : {}),
    })
  }

  const format: ExportFormat | 'VIDEO' = video ? 'VIDEO' : prefs.format
  const formats = [
    ...FORMATS,
    {
      value: 'VIDEO' as const,
      label: 'Video',
      disabled: animatedCount === 0,
      title: animatedCount === 0 ? 'Select a frame animated with Figma Motion' : undefined,
    },
  ]

  return (
    <main class="screen send">
      <Header workspaceName={me?.workspace.name || session.workspace.name} userName={session.user.name} onDisconnect={onDisconnect} />

      <section class="list-area" aria-label="Selected frames">
        <SelectionList
          {...selection}
          scale={prefs.scale}
          limits={limits}
          video={video ? { scale: prefs.videoScale, rules: target?.video } : null}
          onSelectNode={(nodeId) => bridge.send({ type: 'select', nodeId })}
        />
      </section>

      <section class="options">
        <div class="row">
          <Segmented
            label="Format"
            value={format}
            options={formats}
            onChange={(f) => updatePrefs(f === 'VIDEO' ? { video: true } : { video: false, format: f })}
          />
          {video ? (
            <Segmented label="Scale" value={prefs.videoScale} options={VIDEO_SCALES} onChange={(videoScale) => updatePrefs({ videoScale })} />
          ) : (
            <Segmented label="Scale" value={prefs.scale} options={SCALES} onChange={(scale) => updatePrefs({ scale })} />
          )}
        </div>
        {video && (
          <div class="row">
            <Segmented label="File" value={prefs.videoFormat} options={VIDEO_FORMATS} onChange={(videoFormat) => updatePrefs({ videoFormat })} />
            <Segmented label="Quality" value={prefs.videoQuality} options={VIDEO_QUALITIES} onChange={(videoQuality) => updatePrefs({ videoQuality })} />
          </div>
        )}
        <Segmented
          label="Send to"
          value={sendTo}
          options={[
            { value: 'bank', label: 'Content bank', disabled: video, title: video ? 'Videos can only be attached to a post' : undefined },
            { value: 'post', label: 'Campaigns' },
          ]}
          onChange={(v) => setToPost(v === 'post')}
        />
        {video && <p class="muted small">Videos can only be attached to a campaign post.</p>}
        {sendTo === 'post' && <CampaignPicker api={api} selected={post} onSelect={setPost} video={video} />}
      </section>

      <footer class="footer">
        {oversized > 0 && (
          <p class="warning small">
            {oversized === items.length
              ? `${items.length === 1 ? 'This frame is' : 'These frames are'} too large to send.`
              : `${oversized} of ${items.length} frames ${oversized === 1 ? 'is' : 'are'} too large and will be skipped.`}
          </p>
        )}
        {notAnimated > 0 && (
          <p class="warning small">
            {notAnimated} of {items.length} {notAnimated === 1 ? "isn't an animated top-level frame" : "aren't animated top-level frames"} and
            won't be sent.
          </p>
        )}
        {postRefusesVideo && <p class="warning small">This post can't take a video. Pick another post.</p>}
        <button class="primary wide" disabled={blocked} onClick={send}>
          {sendButtonLabel(sendable, sendTo === 'post', video)}
        </button>
      </footer>
    </main>
  )
}

function sendButtonLabel(n: number, toPost: boolean, video: boolean) {
  if (n === 0) return 'Send'
  const noun = video ? 'video' : 'frame'
  const what = n === 1 ? `1 ${noun}` : `${n} ${noun}s`
  return toPost ? `Send ${what} to post` : `Send ${what}`
}
