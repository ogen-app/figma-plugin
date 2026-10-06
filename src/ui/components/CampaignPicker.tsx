import { useEffect, useMemo, useState } from 'preact/hooks'
import { listCampaigns, type Campaign, type CampaignPost } from '../../api/campaigns'
import { isApiError, type ApiClient } from '../../api/client'
import type { PostTarget } from '../../queue/types'
import { campaignStatus, filterTree, groupByDate, postStatus, postTime } from '../campaignTree'
import { PlatformBadge } from './PlatformBadge'

export interface CampaignPickerProps {
  api: ApiClient
  selected: PostTarget | null
  onSelect: (post: PostTarget | null) => void
  // Picking a post for a video: posts that can't take one are disabled.
  video?: boolean
}

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; campaigns: Campaign[] }

export function CampaignPicker({ api, selected, onSelect, video = false }: CampaignPickerProps) {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    const ctrl = new AbortController()
    setLoad({ state: 'loading' })
    listCampaigns(api, ctrl.signal).then(
      (campaigns) => {
        setLoad({ state: 'ready', campaigns })
        // Open the first campaign so the tree doesn't start as a wall of names.
        setExpanded((prev) => (prev.size === 0 && campaigns[0] ? new Set([campaigns[0].id]) : prev))
      },
      (err) => {
        if (ctrl.signal.aborted || (isApiError(err) && err.status === 401)) return
        setLoad({ state: 'error' })
      },
    )
    return () => ctrl.abort()
  }, [api, reloads])

  const visible = useMemo(() => (load.state === 'ready' ? filterTree(load.campaigns, query) : []), [load, query])
  const searching = query.trim() !== ''

  if (selected) {
    return (
      <div class="post-selected">
        <PlatformBadge name={selected.platformName} />
        <div class="post-summary">
          <div class="item-name">{selected.title || 'Untitled post'}</div>
          <div class="muted small">{[selected.campaignName, selected.platformName].filter(Boolean).join(' · ')}</div>
        </div>
        <button class="link" onClick={() => onSelect(null)}>
          Change
        </button>
      </div>
    )
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  function pick(campaign: Campaign, post: CampaignPost) {
    onSelect({
      id: post.id,
      title: post.title,
      campaignName: campaign.name,
      platformName: post.platform?.name ?? '',
      ...(post.video !== undefined ? { video: post.video } : {}),
    })
  }

  return (
    <div class="campaign-picker">
      <input
        type="search"
        placeholder="Search campaigns and posts"
        aria-label="Search campaigns and posts"
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      />
      <div class="tree" aria-live="polite">
        {load.state === 'loading' && <p class="muted small">Loading campaigns…</p>}
        {load.state === 'error' && (
          <p class="warning small">
            Could not load campaigns.{' '}
            <button class="link" onClick={() => setReloads((n) => n + 1)}>
              Retry
            </button>
          </p>
        )}
        {load.state === 'ready' && visible.length === 0 && (
          <p class="muted small">{searching ? 'Nothing matches.' : 'No campaigns in this workspace yet.'}</p>
        )}
        {visible.map((c) => {
          const open = searching || expanded.has(c.id)
          return (
            <section key={c.id} class="campaign">
              <button class="campaign-row" aria-expanded={open} onClick={() => toggle(c.id)} disabled={searching}>
                <span class="chevron" aria-hidden="true">
                  {open ? '▾' : '▸'}
                </span>
                <span class="campaign-name" title={c.name}>
                  {c.name || 'Untitled campaign'}
                </span>
                <span class="muted small campaign-meta">
                  {campaignStatus(c.status)} · {c.posts.length === 1 ? '1 post' : `${c.posts.length} posts`}
                </span>
              </button>
              {open && <CampaignPosts campaign={c} onPick={pick} video={video} />}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function CampaignPosts({
  campaign,
  onPick,
  video,
}: {
  campaign: Campaign
  onPick: (c: Campaign, p: CampaignPost) => void
  video: boolean
}) {
  if (campaign.posts.length === 0) return <p class="muted small tree-empty">No posts yet</p>
  return (
    <div class="campaign-posts">
      {groupByDate(campaign.posts, campaign.timezone).map((group) => (
        <div key={group.key || 'unscheduled'} class="date-group">
          <div class="date-label">{group.label}</div>
          {group.posts.map((post) => {
            const status = postStatus(post.status)
            const time = postTime(post, campaign.timezone)
            const noVideo = video && post.video === null
            return (
              <button
                key={post.id}
                class="post-row"
                disabled={!post.attachable || noVideo}
                title={
                  !post.attachable
                    ? `${status.label} posts can't take new ${video ? 'media' : 'images'}`
                    : noVideo
                      ? "This post can't take a video"
                      : undefined
                }
                onClick={() => onPick(campaign, post)}
              >
                <PlatformBadge name={post.platform?.name} />
                <span class="post-title">{post.title || 'Untitled post'}</span>
                {time && <span class="muted small post-time">{time}</span>}
                <span class={`pill ${status.tone}`}>{status.label}</span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
