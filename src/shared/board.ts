// Campaign boards (CON-354): a page with one placeholder frame per media slot
// of each campaign post, laid out as weeks (rows) by days (columns).
//
// The UI plans a board from the API (dates and labels need Intl, which the
// main sandbox lacks); main draws and syncs it. Everything here is pure, so
// both sides and the tests share it.

export const BOARD_SCHEMA = 1

// Plugin data keys. Plugin data is private to this plugin and saved in the file.
export const DATA_KEYS = {
  // On a placeholder frame: FrameLink.
  link: 'ogen',
  // On a board page: BoardMeta.
  board: 'ogen.board',
  // On the board's own nodes (header, rows, labels, notes): GridTag.
  grid: 'ogen.grid',
} as const

// ── The plan the UI sends ───────────────────────────────────────────────────

export interface PlannedSlot {
  postId: string
  // 0-based slot within the post; carousels plan more than one.
  slot: number
  width: number
  height: number
  // The frame's layer name.
  name: string
  // The annotation drawn above the frame (one or more lines).
  note: string
}

export interface PlannedPost {
  postId: string
  // YYYY-MM-DD in the campaign's zone; "" when unscheduled.
  dayKey: string
  // For "Moved to …": e.g. "Thu, Oct 16", or "Unscheduled".
  dayLabel: string
  // Publish time in ms, to order posts within a day; 0 when unscheduled.
  at: number
  // The canvas every slot of the post has, e.g. "Instagram Story · 1080×1920".
  canvasLabel: string
  // False once the post was submitted: it can't take new media.
  attachable: boolean
  // Empty for a text-only post: it gets no placeholder.
  slots: PlannedSlot[]
}

export interface PlannedWeek {
  // The Monday, YYYY-MM-DD.
  key: string
  label: string
  // Seven day headers, Monday first, e.g. "Mon, Jun 2".
  days: string[]
}

export interface BoardPlan {
  campaignId: string
  workspaceId: string
  // Page name and header title.
  title: string
  // Header line under the title, e.g. "Jun 2 – Jul 13 · Active".
  subtitle: string
  // ISO time of this build or sync, and how the header shows it.
  syncedAt: string
  syncedLabel: string
  weeks: PlannedWeek[]
  posts: PlannedPost[]
  // False when the post list may be cut short (an API cap), so a missing
  // post can't be taken as deleted.
  complete: boolean
}

// ── Stored state ────────────────────────────────────────────────────────────

// FrameLink ties a placeholder frame to its post. Duplicating the frame copies
// it, which is how a designer adds carousel slides.
export interface FrameLink {
  v: number
  postId: string
  campaignId: string
  slot: number
  // The day the frame was placed for, and the canvas it was made at.
  dayKey: string
  width: number
  height: number
  // Lines the last sync flagged ("Deleted in Ogen", …), drawn in the note.
  issues: string[]
  // e.g. "Sent ✓ Oct 8, 14:02"; "" until the frame is sent.
  sent: string
}

export interface GridRow {
  // The week's Monday, or "" for the unscheduled row.
  key: string
  y: number
  height: number
}

export interface Grid {
  x: number
  // Width of the week label column, then of each day column.
  labelWidth: number
  columnWidth: number
  rows: GridRow[]
}

export interface BoardMeta {
  v: number
  campaignId: string
  workspaceId: string
  // The page the board was made on. A duplicated page keeps the original's
  // id here, which is how a copy is told apart.
  pageId: string
  createdAt: string
  lastSyncedAt: string
  grid: Grid
}

export type GridTag =
  | { kind: 'header' }
  | { kind: 'row'; key: string }
  | { kind: 'week-label'; key: string }
  | { kind: 'day-label'; key: string; day: number }
  // The annotation above a placeholder frame.
  | { kind: 'note'; frameId: string }

export function parseLink(raw: string): FrameLink | null {
  const o = parseJson(raw)
  if (!o || typeof o.postId !== 'string' || !o.postId) return null
  return {
    v: num(o.v, 0),
    postId: o.postId,
    campaignId: str(o.campaignId),
    slot: num(o.slot, 0),
    dayKey: str(o.dayKey),
    width: num(o.width, 0),
    height: num(o.height, 0),
    issues: Array.isArray(o.issues) ? o.issues.filter((s): s is string => typeof s === 'string') : [],
    sent: str(o.sent),
  }
}

export function parseMeta(raw: string): BoardMeta | null {
  const o = parseJson(raw)
  if (!o || typeof o.campaignId !== 'string' || !o.campaignId) return null
  const g = isObject(o.grid) ? o.grid : {}
  const rows = Array.isArray(g.rows) ? g.rows : []
  return {
    v: num(o.v, 0),
    campaignId: o.campaignId,
    workspaceId: str(o.workspaceId),
    pageId: str(o.pageId),
    createdAt: str(o.createdAt),
    lastSyncedAt: str(o.lastSyncedAt),
    grid: {
      x: num(g.x, 0),
      labelWidth: num(g.labelWidth, LAYOUT.labelWidth),
      columnWidth: num(g.columnWidth, 0),
      rows: rows.filter(isObject).map((r) => ({ key: str(r.key), y: num(r.y, 0), height: num(r.height, 0) })),
    },
  }
}

export function parseTag(raw: string): GridTag | null {
  const o = parseJson(raw)
  if (!o) return null
  switch (o.kind) {
    case 'header':
      return { kind: 'header' }
    case 'row':
    case 'week-label':
      return { kind: o.kind, key: str(o.key) }
    case 'day-label':
      return { kind: 'day-label', key: str(o.key), day: num(o.day, 0) }
    case 'note':
      return typeof o.frameId === 'string' ? { kind: 'note', frameId: o.frameId } : null
    default:
      return null
  }
}

// ── Layout ──────────────────────────────────────────────────────────────────

// Board sizes in px. Placeholders are real size (a story is 1080×1920), so
// the board's own type and spacing are scaled to match.
export const LAYOUT = {
  labelWidth: 900,
  // Space between day columns and around a row's content.
  gap: 160,
  padding: 120,
  // Day header at the top of each column.
  dayHeader: 180,
  // Room above each frame for its note.
  noteSpace: 200,
  // Space between rows (weeks).
  rowGap: 240,
  // Header block above the first row.
  header: 520,
  // Space between carousel slides side by side.
  slideGap: 80,
} as const

// postWidth is a post's slots side by side.
export function postWidth(post: PlannedPost): number {
  if (post.slots.length === 0) return 0
  return post.slots.reduce((w, s) => w + s.width, 0) + LAYOUT.slideGap * (post.slots.length - 1)
}

export function postHeight(post: PlannedPost): number {
  return post.slots.reduce((h, s) => Math.max(h, s.height), 0)
}

// columnWidth fits the widest post on the board.
export function columnWidth(posts: PlannedPost[]): number {
  return Math.max(1080, ...posts.map(postWidth)) + LAYOUT.gap
}

export interface Placement {
  slot: PlannedSlot
  x: number
  y: number
}

// placeStack lays posts top to bottom from (x, top), each post's slots side
// by side, and returns where each slot goes and the y below the last post.
export function placeStack(posts: PlannedPost[], x: number, top: number): { placements: Placement[]; bottom: number } {
  const placements: Placement[] = []
  let y = top
  for (const post of posts) {
    if (post.slots.length === 0) continue
    y += LAYOUT.noteSpace
    let sx = x
    for (const slot of post.slots) {
      placements.push({ slot, x: sx, y })
      sx += slot.width + LAYOUT.slideGap
    }
    y += postHeight(post) + LAYOUT.gap
  }
  return { placements, bottom: y }
}

// placeFlow lays posts left to right, wrapping at width: the unscheduled row
// has no days to stack under.
export function placeFlow(posts: PlannedPost[], x: number, top: number, width: number): { placements: Placement[]; bottom: number } {
  const placements: Placement[] = []
  let cx = x
  let lineTop = top
  let lineHeight = 0
  for (const post of posts) {
    const w = postWidth(post)
    if (w === 0) continue
    if (cx > x && cx + w > x + width) {
      lineTop += lineHeight
      cx = x
      lineHeight = 0
    }
    let sx = cx
    for (const slot of post.slots) {
      placements.push({ slot, x: sx, y: lineTop + LAYOUT.noteSpace })
      sx += slot.width + LAYOUT.slideGap
    }
    cx += w + LAYOUT.gap
    lineHeight = Math.max(lineHeight, LAYOUT.noteSpace + postHeight(post) + LAYOUT.gap)
  }
  return { placements, bottom: lineTop + lineHeight }
}

// rowContentTop is where posts start in a row: below its padding and, for a
// week, the day headers.
export function rowContentTop(row: GridRow): number {
  return row.y + LAYOUT.padding + (row.key ? LAYOUT.dayHeader : 0)
}

export function columnX(grid: Grid, day: number): number {
  return grid.x + grid.labelWidth + day * grid.columnWidth
}

export function gridWidth(grid: Grid): number {
  return grid.labelWidth + 7 * grid.columnWidth
}

// cellAt finds the board cell a point is in: a week's day, "" for the
// unscheduled row, or null when it's off the grid.
export function cellAt(grid: Grid, x: number, y: number): string | null {
  const row = grid.rows.find((r) => y >= r.y && y < r.y + r.height)
  if (!row) return null
  if (!row.key) return ''
  const day = Math.floor((x - grid.x - grid.labelWidth) / grid.columnWidth)
  if (day < 0 || day > 6) return null
  return addDays(row.key, day)
}

// ── Dates (calendar arithmetic only: no zones) ──────────────────────────────

export function addDays(dayKey: string, n: number): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  const t = new Date(Date.UTC(y!, m! - 1, d! + n))
  return t.toISOString().slice(0, 10)
}

// mondayOf is the Monday of a day's ISO week.
export function mondayOf(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  const weekday = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()
  return addDays(dayKey, -((weekday + 6) % 7))
}

// dayIndex is a day's column, Monday = 0.
export function dayIndex(dayKey: string): number {
  const [y, m, d] = dayKey.split('-').map(Number)
  return (new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() + 6) % 7
}

// ── Sync ────────────────────────────────────────────────────────────────────

export interface ExistingFrame {
  nodeId: string
  link: FrameLink
  // The frame's position on the page and the cell it sits in (see cellAt).
  x: number
  y: number
  height: number
  cell: string | null
}

export interface SyncDiff {
  // Posts with no frame on the board: their slots get placeholders.
  add: PlannedPost[]
  // The issue lines each frame should show now; [] clears them.
  issues: Map<string, string[]>
  counts: { added: number; deleted: number; moved: number; changed: number }
}

export const ISSUE = {
  deleted: 'Deleted in Ogen',
  locked: "Scheduled, can't take new media",
  textOnly: 'Now a text-only post',
} as const

// diffBoard compares the board's frames with the plan. It never moves or
// removes a frame: it lists what to add and what each frame should flag.
export function diffBoard(plan: BoardPlan, frames: ExistingFrame[]): SyncDiff {
  const posts = new Map(plan.posts.map((p) => [p.postId, p]))
  const byPost = new Map<string, ExistingFrame[]>()
  for (const f of frames) {
    const list = byPost.get(f.link.postId)
    if (list) list.push(f)
    else byPost.set(f.link.postId, [f])
  }

  const issues = new Map<string, string[]>()
  const counts = { added: 0, deleted: 0, moved: 0, changed: 0 }
  for (const [postId, group] of byPost) {
    const lines = postIssues(plan, posts.get(postId), group, counts)
    for (const f of group) issues.set(f.nodeId, lines)
  }

  const add = plan.posts.filter((p) => p.slots.length > 0 && !byPost.has(p.postId))
  counts.added = add.length
  return { add, issues, counts }
}

// postIssues are the lines every frame of one post shows.
function postIssues(plan: BoardPlan, post: PlannedPost | undefined, frames: ExistingFrame[], counts: SyncDiff['counts']): string[] {
  if (!post) {
    // An incomplete list can't prove a deletion.
    if (!plan.complete) return []
    counts.deleted++
    return [ISSUE.deleted]
  }
  const lines: string[] = []
  // The post's day is where its first frame sits, so slides spilling into
  // the next column don't count. A frame dragged to the right day is where it
  // belongs; one off the grid is judged by the day it was placed for.
  const first = frames.slice().sort(readingOrder)[0]!
  const day = first.cell ?? first.link.dayKey
  if (day !== post.dayKey) {
    lines.push(post.dayKey ? `Moved to ${post.dayLabel}` : 'Now unscheduled')
    counts.moved++
  }
  if (post.slots.length === 0) {
    lines.push(ISSUE.textOnly)
    counts.changed++
  } else {
    const want = post.slots[0]!
    if (frames.some((f) => f.link.width !== want.width || f.link.height !== want.height)) {
      lines.push(`Now ${post.canvasLabel}`)
      counts.changed++
    }
  }
  if (!post.attachable) lines.push(ISSUE.locked)
  return lines
}

// syncSummary is the one-line result, e.g. "3 added · 1 deleted · 2 moved".
export function syncSummary(c: SyncDiff['counts']): string {
  const parts: string[] = []
  if (c.added > 0) parts.push(`${c.added} added`)
  if (c.deleted > 0) parts.push(`${c.deleted} deleted`)
  if (c.moved > 0) parts.push(`${c.moved} moved`)
  if (c.changed > 0) parts.push(`${c.changed} changed`)
  return parts.join(' · ') || 'Up to date'
}

// noteText is a frame's annotation: the planned note, then its send status
// and issues. The note is stored on the frame so a sync can redraw it.
export function noteText(note: string, link: Pick<FrameLink, 'issues' | 'sent'>): { text: string; issueStart: number } {
  const head = [note, link.sent].filter(Boolean).join('\n')
  if (link.issues.length === 0) return { text: head, issueStart: -1 }
  const issueStart = head.length + 1
  return { text: `${head}\n${link.issues.map((i) => `⚠ ${i}`).join('\n')}`, issueStart }
}

// readingOrder sorts frames the way a carousel reads: top to bottom by rows,
// left to right within a row.
export function readingOrder<T extends { x: number; y: number; height: number }>(a: T, b: T): number {
  const sameRow = Math.abs(a.y - b.y) < Math.min(a.height, b.height) / 2
  return sameRow ? a.x - b.x : a.y - b.y
}

// ── helpers ─────────────────────────────────────────────────────────────────

type Obj = Record<string, unknown>

function isObject(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function parseJson(raw: string): Obj | null {
  if (!raw) return null
  try {
    const v: unknown = JSON.parse(raw)
    return isObject(v) ? v : null
  } catch {
    return null
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
