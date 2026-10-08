import { useEffect, useMemo, useState } from 'preact/hooks'
import { listCampaigns } from '../../api/campaigns'
import { isApiError, type ApiClient } from '../../api/client'
import { DEFAULT_LIMITS, type Me } from '../../api/types'
import { linkedTargets, resolveLinks, type LinkedGroup } from '../../queue/linked'
import type { PostTarget, SendRequest } from '../../queue/types'
import { isVideoExportable, type ExportFormat, type Scale, type VideoFormat, type VideoQuality, type VideoScale } from '../../shared/messages'
import type { Bridge } from '../bridge'
import { postTarget } from '../campaignTree'
import { CampaignPicker } from '../components/CampaignPicker'
import { PlatformBadge } from '../components/PlatformBadge'
import { Segmented } from '../components/Segmented'
import { SelectionList } from '../components/SelectionList'
import { useSelection } from '../hooks/useSelection'
import { pixelWarning } from '../../queue/preflight'
import { DEFAULT_PREFS, type Prefs, type Store } from '../storage'

export const DEFAULT_HEIGHT = 540
export const TALL_HEIGHT = 700
// Linked posts listed before "and N more".
const MAX_GROUPS_SHOWN = 4

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
  me: Me | null
  onSend: (request: SendRequest) => void
}

type Targets = { state: 'idle' | 'loading' | 'error' } | { state: 'ready'; byId: Map<string, PostTarget> }

export function SendScreen({ bridge, api, store, me, onSend }: SendScreenProps) {
  const selection = useSelection(bridge)
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)
  const [toPost, setToPost] = useState(false)
  const [post, setPost] = useState<PostTarget | null>(null)
  // "Send somewhere else": ignore board links for this selection.
  const [ignoreLinks, setIgnoreLinks] = useState(false)
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
  const hasLinks = items.some((i) => i.link)
  const targets = useLinkedTargets(api, hasLinks)
  const linkKey = items.map((i) => i.link?.postId ?? '').join(',')
  useEffect(() => setIgnoreLinks(false), [linkKey])
  const useLinks = hasLinks && !ignoreLinks
  const links = useMemo(
    () => resolveLinks(useLinks ? items : items.map(({ link: _, ...rest }) => rest), targets.state === 'ready' ? targets.byId : null),
    [items, useLinks, targets],
  )
  const linksPending = useLinks && targets.state !== 'ready'

  const animatedCount = items.filter(isVideoExportable).length
  // Video stays chosen while the selection has nothing to animate, but
  // sends images until it does.
  const video = prefs.video && animatedCount > 0
  const loose = links.unlinked
  const sendTo = video || toPost ? 'post' : 'bank'
  const target = sendTo === 'post' ? post : null

  // The campaign tree needs room; grow the window while it's open.
  const picking = loose.length > 0 && sendTo === 'post' && !post
  useEffect(() => {
    bridge.send({ type: 'resize', height: picking ? TALL_HEIGHT : DEFAULT_HEIGHT })
  }, [bridge, picking])

  // An item's post: its board link, else the picked post.
  const linked = linkedTargets(links.groups)
  const rulesFor = (item: { id: string }) => (linked[item.id] ?? target)?.video
  const fits = (item: (typeof items)[number]) => (video ? isVideoExportable(item) && rulesFor(item) !== null : !pixelWarning(item, prefs.scale, limits))

  const oversized = video ? 0 : items.filter((i) => pixelWarning(i, prefs.scale, limits)).length
  const notAnimated = video ? items.length - animatedCount : 0
  const noVideo = video ? links.groups.flatMap((g) => g.items).filter((i) => isVideoExportable(i) && linked[i.id]?.video === null).length : 0
  const looseSendable = loose.filter(fits)
  const groups = links.groups.map((g) => ({ ...g, items: g.items.filter(fits) })).filter((g) => g.items.length > 0)
  const linkedSendable = groups.reduce((n, g) => n + g.items.length, 0)
  const sendable = looseSendable.length + linkedSendable
  // A post picked in image mode may not take video; keep it picked so
  // switching back to images still works, but don't send video to it.
  const postRefusesVideo = video && looseSendable.length === 0 && loose.some(isVideoExportable) && post?.video === null
  const needsPick = looseSendable.length > 0 && sendTo === 'post' && !post
  const blocked = sendable === 0 || needsPick || linksPending

  function send() {
    const loosePart = postRefusesVideo ? [] : looseSendable
    onSend({
      items: [...loosePart, ...groups.flatMap((g) => g.items)],
      format: prefs.format,
      scale: prefs.scale,
      destination: sendTo === 'post' && post ? { kind: 'post', post } : { kind: 'bank' },
      ...(groups.length > 0 ? { linked: linkedTargets(groups) } : {}),
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
  const postCount = groups.length + (looseSendable.length > 0 && sendTo === 'post' ? 1 : 0)
  const toBank = looseSendable.length > 0 && sendTo === 'bank'

  return (
    <>
      <section class="list-area" aria-label="Selected frames">
        <SelectionList
          {...selection}
          scale={prefs.scale}
          limits={limits}
          video={video ? { scale: prefs.videoScale, rulesFor } : null}
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
        {useLinks && (
          <LinkedPosts
            groups={links.groups}
            state={targets.state}
            onIgnore={() => setIgnoreLinks(true)}
          />
        )}
        {hasLinks && !useLinks && (
          <p class="muted small">
            Board links are ignored for this send.{' '}
            <button class="link" onClick={() => setIgnoreLinks(false)}>
              Send to the linked posts
            </button>
          </p>
        )}
        {loose.length > 0 && (
          <>
            <Segmented
              label={useLinks ? 'Send the other frames to' : 'Send to'}
              value={sendTo}
              options={[
                { value: 'bank', label: 'Content bank', disabled: video, title: video ? 'Videos can only be attached to a post' : undefined },
                { value: 'post', label: 'Campaigns' },
              ]}
              onChange={(v) => setToPost(v === 'post')}
            />
            {video && <p class="muted small">Videos can only be attached to a campaign post.</p>}
            {sendTo === 'post' && <CampaignPicker api={api} selected={post} onSelect={setPost} video={video} />}
          </>
        )}
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
        {noVideo > 0 && <p class="warning small">{count(noVideo)} linked to a post that can't take a video and won't be sent.</p>}
        {links.missing.length > 0 && <p class="warning small">{count(links.missing.length)} linked to a post that's no longer in Ogen and won't be sent.</p>}
        {links.locked.length > 0 && (
          <p class="warning small">{count(links.locked.length)} linked to a post that was already scheduled or published and won't be sent.</p>
        )}
        {links.crowded.map((g) => (
          <p key={g.target.id} class="warning small">
            {g.items.length} frames link to “{g.target.title || 'Untitled post'}”, which takes {g.target.maxAttachments}.
          </p>
        ))}
        {targets.state === 'error' && useLinks && <p class="warning small">Could not load the linked posts from Ogen.</p>}
        {postRefusesVideo && <p class="warning small">This post can't take a video. Pick another post.</p>}
        <button class="primary wide" disabled={blocked} onClick={send}>
          {sendButtonLabel(sendable, video, postCount, toBank)}
        </button>
      </footer>
    </>
  )
}

// useLinkedTargets loads the posts board frames can link to, once any are
// selected.
function useLinkedTargets(api: ApiClient, enabled: boolean): Targets {
  const [targets, setTargets] = useState<Targets>({ state: 'idle' })
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!enabled || loaded) return
    const ctrl = new AbortController()
    setTargets({ state: 'loading' })
    listCampaigns(api, ctrl.signal).then(
      (campaigns) => {
        const byId = new Map<string, PostTarget>()
        for (const c of campaigns) for (const p of c.posts) byId.set(p.id, postTarget(c, p))
        setTargets({ state: 'ready', byId })
        setLoaded(true)
      },
      (err) => {
        if (ctrl.signal.aborted || (isApiError(err) && err.status === 401)) return
        setTargets({ state: 'error' })
      },
    )
    return () => ctrl.abort()
  }, [api, enabled, loaded])
  return targets
}

function LinkedPosts({ groups, state, onIgnore }: { groups: LinkedGroup[]; state: Targets['state']; onIgnore: () => void }) {
  const shown = groups.slice(0, MAX_GROUPS_SHOWN)
  return (
    <div class="field">
      <span class="field-label">{groups.length > 1 ? `Sending to ${groups.length} posts from the board` : 'Sending to the post from the board'}</span>
      {state === 'loading' && <p class="muted small">Loading the linked posts…</p>}
      {shown.map((g) => (
        <div key={g.target.id} class="post-selected">
          <PlatformBadge name={g.target.platformName} />
          <div class="post-summary">
            <div class="item-name">{g.target.title || 'Untitled post'}</div>
            <div class="muted small">
              {[g.target.detail, g.items.length > 1 ? `${g.items.length} frames` : ''].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
      ))}
      {groups.length > shown.length && <p class="muted small">and {groups.length - shown.length} more</p>}
      <button class="link align-start" onClick={onIgnore}>
        Send somewhere else…
      </button>
    </div>
  )
}

function count(n: number): string {
  return n === 1 ? '1 frame is' : `${n} frames are`
}

function sendButtonLabel(n: number, video: boolean, posts: number, toBank: boolean) {
  if (n === 0) return 'Send'
  const noun = video ? 'video' : 'frame'
  const what = n === 1 ? `1 ${noun}` : `${n} ${noun}s`
  if (posts === 0 || toBank) return `Send ${what}`
  return posts === 1 ? `Send ${what} to post` : `Send ${what} to ${posts} posts`
}
