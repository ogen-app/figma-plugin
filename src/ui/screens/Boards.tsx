import { useEffect, useMemo, useState } from 'preact/hooks'
import { listCampaigns, type Campaign } from '../../api/campaigns'
import { isApiError, type ApiClient } from '../../api/client'
import { errorMessage } from '../../queue/errors'
import type { BoardInfo } from '../../shared/messages'
import type { Bridge } from '../bridge'
import { planBoard, type PlanStats } from '../boardPlan'
import { fetchCampaign } from '../boardSync'
import { campaignStatus, dateRange, relativeTime } from '../campaignTree'
import { TALL_HEIGHT } from './Send'

// The Boards tab (CON-354): campaigns with a board in this file, to sync or
// open, and the others, to build a board for.

export interface BoardsScreenProps {
  bridge: Bridge
  api: ApiClient
  workspaceId: string
  // The current page's board when the plugin opened on one.
  current: { campaignId: string; copy: boolean } | null
}

type Load<T> = { state: 'loading' } | { state: 'error' } | { state: 'ready'; value: T }

type RowResult = { tone: 'success' | 'warning' | 'danger'; text: string; nodeIds?: string[]; pageId?: string }

// Campaigns that won't get new posts aren't offered a new board.
const CLOSED = new Set(['completed', 'archived'])

const TICK_MS = 60_000

export function BoardsScreen({ bridge, api, workspaceId, current }: BoardsScreenProps) {
  const [campaigns, setCampaigns] = useState<Load<Campaign[]>>({ state: 'loading' })
  const [boards, setBoards] = useState<BoardInfo[] | null>(null)
  const [query, setQuery] = useState('')
  const [reloads, setReloads] = useState(0)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, RowResult>>({})
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const ctrl = new AbortController()
    setCampaigns({ state: 'loading' })
    listCampaigns(api, ctrl.signal).then(
      (value) => setCampaigns({ state: 'ready', value }),
      (err) => {
        if (ctrl.signal.aborted || (isApiError(err) && err.status === 401)) return
        setCampaigns({ state: 'error' })
      },
    )
    return () => ctrl.abort()
  }, [api, reloads])

  const loadBoards = () =>
    bridge.call('boardsList', {}).then(setBoards, (err) => {
      bridge.send({ type: 'notify', message: `Could not read this file's boards: ${errorMessage(err)}`, error: true })
      setBoards([])
    })
  useEffect(() => {
    void loadBoards()
  }, [bridge])

  useEffect(() => {
    bridge.send({ type: 'resize', height: TALL_HEIGHT })
  }, [bridge])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [])

  const list = campaigns.state === 'ready' ? campaigns.value : []
  const byId = useMemo(() => new Map(list.map((c) => [c.id, c])), [list])
  const q = query.trim().toLowerCase()
  const matches = (name: string) => !q || name.toLowerCase().includes(q)

  const own = (boards ?? []).filter((b) => !b.copy)
  const copies = (boards ?? []).filter((b) => b.copy)
  const boarded = new Set(own.map((b) => b.campaignId))
  const inFile = own
    .map((b) => ({ board: b, campaign: byId.get(b.campaignId) ?? null, name: byId.get(b.campaignId)?.name || boardName(b) }))
    .filter((r) => matches(r.name))
    .sort((a, b) => Number(b.board.campaignId === current?.campaignId) - Number(a.board.campaignId === current?.campaignId))
  const others = list.filter((c) => !boarded.has(c.id) && !CLOSED.has(c.status) && matches(c.name))

  function setResult(key: string, r: RowResult | null) {
    setResults((prev) => {
      const next = { ...prev }
      if (r) next[key] = r
      else delete next[key]
      return next
    })
  }

  async function sync(board: BoardInfo, name: string) {
    setBusy(board.pageId)
    setResult(board.campaignId, null)
    try {
      const got = await fetchCampaign(api, board.campaignId)
      if (got.kind === 'gone') {
        await bridge.call('boardGone', { pageId: board.pageId, plan: { title: name, subtitle: '', syncedLabel: '' }, banner: 'Campaign deleted in Ogen' })
        setResult(board.campaignId, { tone: 'danger', text: 'This campaign was deleted in Ogen. The board is kept as it is.' })
      } else if (got.kind === 'unknown') {
        setResult(board.campaignId, { tone: 'warning', text: "Couldn't find this campaign in Ogen. It may be archived." })
      } else {
        const { plan } = planBoard(got.campaign, { workspaceId, complete: got.complete })
        const res = await bridge.call('boardSync', { pageId: board.pageId, plan })
        const partial = got.complete ? '' : ' Deleted posts were not checked: the campaign has too many posts.'
        setResult(board.campaignId, { tone: 'success', text: `${res.summary}.${partial}`, nodeIds: res.nodeIds, pageId: board.pageId })
        await loadBoards()
      }
    } catch (err) {
      if (isApiError(err) && err.status === 401) return
      setResult(board.campaignId, { tone: 'danger', text: `Sync failed: ${errorMessage(err)}` })
    } finally {
      setBusy(null)
    }
  }

  async function create(campaign: Campaign) {
    setBusy(campaign.id)
    setResult(campaign.id, null)
    try {
      const got = await fetchCampaign(api, campaign.id)
      const full = got.kind === 'found' ? got.campaign : campaign
      const { plan } = planBoard(full, { workspaceId, complete: got.kind === 'found' && got.complete })
      const res = await bridge.call('boardCreate', { plan })
      setPreview(null)
      setResult(campaign.id, { tone: 'success', text: `Board created with ${plural(res.placeholders, 'placeholder')}.` })
      await loadBoards()
    } catch (err) {
      if (isApiError(err) && err.status === 401) return
      setResult(campaign.id, { tone: 'danger', text: `Could not create the board: ${errorMessage(err)}` })
    } finally {
      setBusy(null)
    }
  }

  const currentCopy = current?.copy ? copies.find((b) => b.campaignId === current.campaignId) : undefined

  return (
    <div class="boards">
      <div class="boards-search">
        <input type="search" placeholder="Search campaigns" aria-label="Search campaigns" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
      </div>
      <div class="boards-list" aria-live="polite">
        {currentCopy && (
          <p class="banner small">This page is a copy of a board. Copies aren't synced; sync the original board instead.</p>
        )}
        {campaigns.state === 'error' && (
          <p class="warning small">
            Could not load campaigns.{' '}
            <button class="link" onClick={() => setReloads((n) => n + 1)}>
              Retry
            </button>
          </p>
        )}

        <h2 class="group-label">In this file</h2>
        {boards === null ? (
          <p class="muted small">Looking for boards…</p>
        ) : inFile.length === 0 ? (
          <p class="muted small">{q ? 'No board matches.' : 'No boards in this file yet. Create one from a campaign below.'}</p>
        ) : (
          inFile.map(({ board, campaign, name }) => {
            const otherWorkspace = !!board.workspaceId && board.workspaceId !== workspaceId
            const changed = !!campaign?.posts_changed_at && Date.parse(campaign.posts_changed_at) > Date.parse(board.lastSyncedAt)
            const result = results[board.campaignId]
            return (
              <div key={board.pageId} class={`board-row${board.campaignId === current?.campaignId ? ' current' : ''}`}>
                <div class="board-head">
                  <span class="board-name" title={name}>
                    {name}
                  </span>
                  {campaign && <span class="pill">{campaignStatus(campaign.status)}</span>}
                </div>
                <div class="muted small">{campaignLine(campaign)}</div>
                <div class="board-actions">
                  <span class="muted small" title={board.lastSyncedAt ? new Date(board.lastSyncedAt).toLocaleString() : undefined}>
                    {board.lastSyncedAt ? `Synced ${relativeTime(board.lastSyncedAt, now)}` : 'Never synced'}
                  </span>
                  {changed && <span class="pill warning">Changes</span>}
                  <span class="spacer" />
                  <button class="small-button" disabled={busy !== null || otherWorkspace} onClick={() => void sync(board, name)}>
                    {busy === board.pageId ? 'Syncing…' : '↻ Sync'}
                  </button>
                  <button class="small-button" aria-label={`Go to the ${name} board`} title="Go to board" onClick={() => void bridge.call('boardOpen', { pageId: board.pageId })}>
                    →
                  </button>
                </div>
                {otherWorkspace && <p class="warning small">This board belongs to another Ogen workspace.</p>}
                {result && <ResultLine result={result} bridge={bridge} />}
              </div>
            )
          })
        )}

        <h2 class="group-label">Other campaigns</h2>
        {campaigns.state === 'loading' && <p class="muted small">Loading campaigns…</p>}
        {campaigns.state === 'ready' && others.length === 0 && (
          <p class="muted small">{q ? 'No campaign matches.' : 'Every active campaign has a board here.'}</p>
        )}
        {others.map((c) => {
          const result = results[c.id]
          const open = preview === c.id
          return (
            <div key={c.id} class="board-row">
              <div class="board-head">
                <span class="board-name" title={c.name}>
                  {c.name || 'Untitled campaign'}
                </span>
                <span class="pill">{campaignStatus(c.status)}</span>
              </div>
              <div class="muted small">{campaignLine(c)}</div>
              {open ? (
                <Preview stats={planBoard(c, { workspaceId }).stats} />
              ) : null}
              <div class="board-actions">
                <span class="spacer" />
                {open && (
                  <button class="small-button" disabled={busy !== null} onClick={() => setPreview(null)}>
                    Cancel
                  </button>
                )}
                <button class={`small-button${open ? ' primary' : ''}`} disabled={busy !== null} onClick={() => (open ? void create(c) : setPreview(c.id))}>
                  {busy === c.id ? 'Creating…' : 'Create board'}
                </button>
              </div>
              {result && <ResultLine result={result} bridge={bridge} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Preview({ stats }: { stats: PlanStats }) {
  return (
    <ul class="preview small">
      <li>
        {plural(stats.weeks, 'week')} · {plural(stats.posts, 'post')}
      </li>
      <li>{plural(stats.placeholders, 'placeholder')}</li>
      {stats.textOnly > 0 && <li class="muted">{stats.textOnly} text-only (no placeholder)</li>}
      {stats.unscheduled > 0 && <li class="muted">{stats.unscheduled} unscheduled</li>}
      {stats.noType > 0 && <li class="warning">{stats.noType} without a post type (square placeholder)</li>}
      {stats.placeholders > LARGE_BOARD && <li class="warning">A large board: building it may take a while.</li>}
    </ul>
  )
}

const LARGE_BOARD = 300

function ResultLine({ result, bridge }: { result: RowResult; bridge: Bridge }) {
  const { nodeIds, pageId } = result
  return (
    <p class={`small ${result.tone}`}>
      {result.text}{' '}
      {pageId && nodeIds && nodeIds.length > 0 && (
        <button class="link" onClick={() => void bridge.call('boardOpen', { pageId, nodeIds })}>
          Show
        </button>
      )}
    </p>
  )
}

function campaignLine(c: Campaign | null): string {
  if (!c) return 'Not among active campaigns'
  return [dateRange(c), plural(c.posts.length, 'post')].filter(Boolean).join(' · ')
}

// boardName is the page name without the board's calendar mark.
function boardName(b: BoardInfo): string {
  return b.pageName.replace(/^🗓\s*/u, '') || 'Untitled board'
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}
