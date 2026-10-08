import {
  BOARD_SCHEMA,
  DATA_KEYS,
  LAYOUT,
  cellAt,
  columnWidth,
  columnX,
  dayIndex,
  diffBoard,
  gridWidth,
  mondayOf,
  noteText,
  parseLink,
  parseMeta,
  parseTag,
  placeFlow,
  placeStack,
  rowContentTop,
  syncSummary,
  type BoardMeta,
  type BoardPlan,
  type ExistingFrame,
  type FrameLink,
  type Grid,
  type GridRow,
  type GridTag,
  type PlannedPost,
  type PlannedWeek,
} from '../shared/board'
import type { BoardInfo, BoardSyncResult } from '../shared/messages'

// Draws and syncs campaign boards (CON-354). Placeholders are frames placed
// directly on the page (Figma exports video only from those); the week and
// day structure is drawn around them as locked shapes and text.

// A week with no posts still gets room for one portrait post.
const MIN_ROW_CONTENT = LAYOUT.noteSpace + 1350
const COLORS = {
  row: { r: 0.965, g: 0.965, b: 0.973 },
  unscheduled: { r: 0.98, g: 0.965, b: 0.93 },
  placeholder: { r: 1, g: 1, b: 1 },
  text: { r: 0.1, g: 0.1, b: 0.12 },
  muted: { r: 0.42, g: 0.42, b: 0.46 },
  issue: { r: 0.85, g: 0.18, b: 0.15 },
  sent: { r: 0.1, g: 0.55, b: 0.3 },
}

type HeaderText = Pick<BoardPlan, 'title' | 'subtitle' | 'syncedLabel'>

interface Fonts {
  regular: FontName
  bold: FontName
}

let fonts: Promise<Fonts> | null = null

// loadFonts loads Inter, or the first font with a Regular style when Inter
// isn't available.
function loadFonts(): Promise<Fonts> {
  fonts ??= (async () => {
    const inter = { regular: { family: 'Inter', style: 'Regular' }, bold: { family: 'Inter', style: 'Bold' } }
    try {
      await Promise.all([figma.loadFontAsync(inter.regular), figma.loadFontAsync(inter.bold)])
      return inter
    } catch {
      const available = await figma.listAvailableFontsAsync()
      const regular = available.find((f) => f.fontName.style === 'Regular')?.fontName ?? available[0]!.fontName
      await figma.loadFontAsync(regular)
      return { regular, bold: regular }
    }
  })()
  fonts.catch(() => {
    fonts = null
  })
  return fonts
}

// ── Listing ─────────────────────────────────────────────────────────────────

export async function listBoards(): Promise<BoardInfo[]> {
  const out: BoardInfo[] = []
  for (const page of figma.root.children) {
    const meta = await readMeta(page)
    if (!meta) continue
    out.push({
      pageId: page.id,
      pageName: page.name,
      campaignId: meta.campaignId,
      workspaceId: meta.workspaceId,
      lastSyncedAt: meta.lastSyncedAt,
      copy: meta.pageId !== page.id,
    })
  }
  return out
}

async function readMeta(page: PageNode): Promise<BoardMeta | null> {
  let raw: string
  try {
    raw = page.getPluginData(DATA_KEYS.board)
  } catch {
    // Pages not loaded yet under dynamic-page access.
    await page.loadAsync()
    raw = page.getPluginData(DATA_KEYS.board)
  }
  return parseMeta(raw)
}

async function boardPage(pageId: string): Promise<{ page: PageNode; meta: BoardMeta }> {
  const node = await figma.getNodeByIdAsync(pageId)
  if (!node || node.type !== 'PAGE') throw new Error('The board page no longer exists.')
  await node.loadAsync()
  const meta = await readMeta(node)
  if (!meta) throw new Error('This page is not a campaign board.')
  if (meta.pageId !== node.id) throw new Error('This page is a copy of a board and is not synced.')
  return { page: node, meta }
}

export async function openBoard(pageId: string, nodeIds: string[] = []): Promise<void> {
  const node = await figma.getNodeByIdAsync(pageId)
  if (!node || node.type !== 'PAGE') throw new Error('The board page no longer exists.')
  await figma.setCurrentPageAsync(node)
  const nodes: SceneNode[] = []
  for (const id of nodeIds) {
    const n = await figma.getNodeByIdAsync(id)
    if (n && !n.removed && 'visible' in n) nodes.push(n as SceneNode)
  }
  if (nodes.length > 0) figma.currentPage.selection = nodes
  figma.viewport.scrollAndZoomIntoView(nodes.length > 0 ? nodes : node.children)
}

// ── Building ────────────────────────────────────────────────────────────────

export async function createBoard(plan: BoardPlan): Promise<{ pageId: string; placeholders: number }> {
  const f = await loadFonts()
  const page = figma.createPage()
  page.name = `🗓 ${plan.title}`
  page.setRelaunchData({ boards: 'Sync this board with its Ogen campaign' })

  const grid: Grid = { x: 0, labelWidth: LAYOUT.labelWidth, columnWidth: columnWidth(plan.posts), rows: [] }
  drawHeader(page, plan, f)

  let y = LAYOUT.header
  let placeholders = 0
  for (const week of plan.weeks) {
    const row: GridRow = { key: week.key, y, height: 0 }
    let bottom = rowContentTop(row) + MIN_ROW_CONTENT
    for (let day = 0; day < 7; day++) {
      const posts = plan.posts.filter((p) => p.dayKey && mondayOf(p.dayKey) === week.key && dayIndex(p.dayKey) === day)
      const placed = placeStack(posts, columnX(grid, day), rowContentTop(row))
      placeholders += drawPlacements(page, plan, posts, placed.placements, f)
      bottom = Math.max(bottom, placed.bottom)
    }
    row.height = bottom - y + LAYOUT.padding
    grid.rows.push(row)
    drawRow(page, grid, row, week, f)
    y += row.height + LAYOUT.rowGap
  }

  const unscheduled = plan.posts.filter((p) => !p.dayKey && p.slots.length > 0)
  if (unscheduled.length > 0) {
    const row: GridRow = { key: '', y, height: 0 }
    const placed = placeFlow(unscheduled, columnX(grid, 0), rowContentTop(row), 7 * grid.columnWidth)
    placeholders += drawPlacements(page, plan, unscheduled, placed.placements, f)
    row.height = Math.max(placed.bottom, rowContentTop(row) + MIN_ROW_CONTENT) - y + LAYOUT.padding
    grid.rows.push(row)
    drawRow(page, grid, row, null, f)
  }

  writeMeta(page, { v: BOARD_SCHEMA, campaignId: plan.campaignId, workspaceId: plan.workspaceId, pageId: page.id, createdAt: plan.syncedAt, lastSyncedAt: plan.syncedAt, grid })
  await openBoard(page.id)
  return { pageId: page.id, placeholders }
}

function drawPlacements(page: PageNode, plan: BoardPlan, posts: PlannedPost[], placements: ReturnType<typeof placeStack>['placements'], f: Fonts): number {
  const byId = new Map(posts.map((p) => [p.postId, p]))
  for (const { slot, x, y } of placements) {
    const post = byId.get(slot.postId)!
    const frame = figma.createFrame()
    page.appendChild(frame)
    frame.name = slot.name
    frame.resize(slot.width, slot.height)
    frame.x = x
    frame.y = y
    frame.fills = [{ type: 'SOLID', color: COLORS.placeholder }]
    frame.clipsContent = true
    const link: FrameLink = {
      v: BOARD_SCHEMA,
      postId: slot.postId,
      campaignId: plan.campaignId,
      slot: slot.slot,
      dayKey: post.dayKey,
      width: slot.width,
      height: slot.height,
      note: slot.note,
      issues: [],
      sent: '',
    }
    writeLink(frame, link)
    frame.setRelaunchData({ send: 'Send this frame to its Ogen post' })
    drawNote(page, frame, link, f)
  }
  return placements.length
}

function drawHeader(page: PageNode, plan: HeaderText, f: Fonts, banner = '') {
  let text = findTagged(page, (t) => t.kind === 'header')[0]?.node as TextNode | undefined
  if (!text || text.type !== 'TEXT') {
    text = figma.createText()
    page.appendChild(text)
    text.x = 0
    text.y = 0
    tag(text, { kind: 'header' })
    text.locked = true
    text.name = 'Ogen board header'
  }
  const title = plan.title
  const rest = [plan.subtitle, plan.syncedLabel, banner].filter(Boolean).join('\n')
  text.fontName = f.regular
  text.characters = `${title}\n${rest}`
  text.fontSize = 72
  text.fills = [{ type: 'SOLID', color: COLORS.muted }]
  text.setRangeFontName(0, title.length, f.bold)
  text.setRangeFontSize(0, title.length, 160)
  text.setRangeFills(0, title.length, [{ type: 'SOLID', color: COLORS.text }])
  if (banner) text.setRangeFills(text.characters.length - banner.length, text.characters.length, [{ type: 'SOLID', color: COLORS.issue }])
}

function drawRow(page: PageNode, grid: Grid, row: GridRow, week: PlannedWeek | null, f: Fonts) {
  const bg = figma.createRectangle()
  // Behind everything, so frames and notes stay on top.
  page.insertChild(0, bg)
  bg.name = week ? `Ogen week ${week.key}` : 'Ogen unscheduled'
  bg.x = grid.x
  bg.y = row.y
  bg.resize(gridWidth(grid), row.height)
  bg.cornerRadius = 48
  bg.fills = [{ type: 'SOLID', color: week ? COLORS.row : COLORS.unscheduled }]
  bg.locked = true
  tag(bg, { kind: 'row', key: row.key })

  const label = text(page, week ? week.label : 'Unscheduled', 96, f.bold, COLORS.text)
  label.x = grid.x + LAYOUT.padding
  label.y = row.y + LAYOUT.padding
  label.name = 'Ogen week label'
  label.locked = true
  tag(label, { kind: 'week-label', key: row.key })
  if (!week) return
  for (let day = 0; day < 7; day++) {
    const d = text(page, week.days[day]!, 64, f.bold, COLORS.muted)
    d.x = columnX(grid, day)
    d.y = row.y + LAYOUT.padding
    d.name = 'Ogen day label'
    d.locked = true
    tag(d, { kind: 'day-label', key: row.key, day })
  }
}

function text(page: PageNode, characters: string, size: number, font: FontName, color: RGB): TextNode {
  const t = figma.createText()
  page.appendChild(t)
  t.fontName = font
  t.characters = characters
  t.fontSize = size
  t.fills = [{ type: 'SOLID', color }]
  return t
}

// drawNote (re)draws the annotation above a frame: what the frame is for,
// then its send status and sync issues.
function drawNote(page: PageNode, frame: FrameNode, link: FrameLink, f: Fonts, existing?: TextNode) {
  const note = existing ?? figma.createText()
  if (!existing) {
    page.appendChild(note)
    note.name = 'Ogen note'
    note.locked = true
    tag(note, { kind: 'note', frameId: frame.id })
  }
  const { text: characters, issueStart } = noteText(link.note || frame.name, link)
  note.fontName = f.regular
  note.characters = characters
  note.fontSize = 40
  note.lineHeight = { unit: 'PERCENT', value: 120 }
  note.fills = [{ type: 'SOLID', color: COLORS.muted }]
  if (link.sent) {
    const at = characters.indexOf(link.sent)
    if (at >= 0) note.setRangeFills(at, at + link.sent.length, [{ type: 'SOLID', color: COLORS.sent }])
  }
  if (issueStart >= 0) {
    note.setRangeFills(issueStart, characters.length, [{ type: 'SOLID', color: COLORS.issue }])
    note.setRangeFontName(issueStart, characters.length, f.bold)
  }
  note.textAutoResize = 'HEIGHT'
  note.resize(Math.max(frame.width, 600), note.height)
  note.x = frame.x
  note.y = frame.y - note.height - 24
}

// ── Syncing ─────────────────────────────────────────────────────────────────

export async function syncBoard(pageId: string, plan: BoardPlan): Promise<BoardSyncResult> {
  const { page, meta } = await boardPage(pageId)
  if (meta.campaignId !== plan.campaignId) throw new Error('This board belongs to another campaign.')
  const f = await loadFonts()
  const grid = meta.grid

  const frames = linkedFrames(page, plan.campaignId)
  const existing: ExistingFrame[] = frames.map(({ node, link }) => {
    const { x, y } = absolute(node)
    return { nodeId: node.id, link, x, y, height: node.height, cell: cellAt(grid, x + 1, y + 1) }
  })
  const diff = diffBoard(plan, existing)
  const planned = new Map(plan.posts.map((p) => [p.postId, p]))

  // Weeks the campaign gained (new dates), in date order.
  for (const week of plan.weeks) {
    if (!grid.rows.some((r) => r.key === week.key)) insertRow(page, grid, week, f)
  }
  relabelWeeks(page, plan)

  const notes = notesByFrame(page)
  for (const { node, link } of frames) {
    const post = planned.get(link.postId)
    const slot = post?.slots.find((s) => s.slot === link.slot) ?? post?.slots[0]
    const next: FrameLink = { ...link, issues: diff.issues.get(node.id) ?? [], note: slot?.note ?? link.note }
    writeLink(node, next)
    drawNote(page, node, next, f, notes.get(node.id))
    notes.delete(node.id)
  }
  // Notes whose frame was deleted.
  for (const note of notes.values()) note.remove()

  const added: string[] = []
  for (const post of diff.add) added.push(...addPost(page, grid, plan, post, f))

  drawHeader(page, plan, f)
  writeMeta(page, { ...meta, lastSyncedAt: plan.syncedAt, grid })
  const changed = existing.filter((e) => (diff.issues.get(e.nodeId) ?? []).length > 0).map((e) => e.nodeId)
  return { summary: syncSummary(diff.counts), counts: diff.counts, nodeIds: [...added, ...changed], lastSyncedAt: plan.syncedAt }
}

// markGone records on the board that its campaign was deleted in Ogen.
export async function markGone(pageId: string, plan: HeaderText, banner: string): Promise<void> {
  const { page } = await boardPage(pageId)
  drawHeader(page, plan, await loadFonts(), banner)
}

// addPost places a post's slots at the bottom of its day (or the unscheduled
// row), growing the row when it runs out of room.
function addPost(page: PageNode, grid: Grid, plan: BoardPlan, post: PlannedPost, f: Fonts): string[] {
  const key = post.dayKey ? mondayOf(post.dayKey) : ''
  let row = grid.rows.find((r) => r.key === key)
  if (!row) row = key ? insertRow(page, grid, plan.weeks.find((w) => w.key === key) ?? fallbackWeek(key), f) : insertRow(page, grid, null, f)

  const inRow = linkedFrames(page, plan.campaignId)
    .map(({ node }) => ({ node, ...absolute(node) }))
    .filter(({ y }) => y >= row.y && y < row.y + row.height)
  let placements: ReturnType<typeof placeStack>
  if (post.dayKey) {
    const day = dayIndex(post.dayKey)
    const x = columnX(grid, day)
    const top = inRow
      .filter(({ x: fx, y: fy }) => cellAt(grid, fx + 1, fy + 1) === post.dayKey)
      .reduce((t, { y, node }) => Math.max(t, y + node.height + LAYOUT.gap), rowContentTop(row))
    placements = placeStack([post], x, top)
  } else {
    const top = inRow.reduce((t, { y, node }) => Math.max(t, y + node.height + LAYOUT.gap), rowContentTop(row))
    placements = placeFlow([post], columnX(grid, 0), top, 7 * grid.columnWidth)
  }
  const overflow = placements.bottom + LAYOUT.padding - (row.y + row.height)
  if (overflow > 0) growRow(page, grid, row, overflow)

  const before = new Set(page.children.map((c) => c.id))
  drawPlacements(page, plan, [post], placements.placements, f)
  return page.children.filter((c) => !before.has(c.id) && c.type === 'FRAME').map((c) => c.id)
}

// insertRow adds a week (or the unscheduled row) in date order, moving
// everything below it down to make room.
function insertRow(page: PageNode, grid: Grid, week: PlannedWeek | null, f: Fonts): GridRow {
  const key = week?.key ?? ''
  const before = grid.rows.filter((r) => r.key && (!key || r.key < key))
  const prev = before[before.length - 1]
  const y = prev ? prev.y + prev.height + LAYOUT.rowGap : LAYOUT.header
  const row: GridRow = { key, y, height: LAYOUT.padding * 2 + (key ? LAYOUT.dayHeader : 0) + MIN_ROW_CONTENT }
  shiftBelow(page, grid, y, row.height + LAYOUT.rowGap)
  grid.rows.push(row)
  grid.rows.sort((a, b) => a.y - b.y)
  drawRow(page, grid, row, week, f)
  return row
}

// growRow makes a row taller, moving everything below it down.
function growRow(page: PageNode, grid: Grid, row: GridRow, delta: number) {
  shiftBelow(page, grid, row.y + row.height, delta)
  row.height += delta
  const bg = findTagged(page, (t) => t.kind === 'row' && t.key === row.key)[0]?.node
  if (bg && bg.type === 'RECTANGLE') bg.resize(bg.width, row.height)
}

// shiftBelow moves every node on the page that starts at or below y, and the
// rows there, down by delta. Whole rows move together, so designs keep their
// place within their week.
function shiftBelow(page: PageNode, grid: Grid, y: number, delta: number) {
  for (const node of page.children) {
    if (node.y >= y) node.y += delta
  }
  for (const r of grid.rows) if (r.y >= y) r.y += delta
}

function relabelWeeks(page: PageNode, plan: BoardPlan) {
  const labels = new Map(plan.weeks.map((w) => [w.key, w.label]))
  for (const { node, tag: t } of findTagged(page, (t) => t.kind === 'week-label')) {
    const label = t.kind === 'week-label' ? labels.get(t.key) : undefined
    if (label && node.type === 'TEXT' && node.characters !== label) node.characters = label
  }
}

function fallbackWeek(key: string): PlannedWeek {
  return { key, label: key, days: Array.from({ length: 7 }, () => '') }
}

// ── Sending ─────────────────────────────────────────────────────────────────

// markSent records a send on each linked frame and redraws its note.
export async function markSent(nodeIds: string[], label: string): Promise<void> {
  const f = await loadFonts()
  for (const id of nodeIds) {
    const node = await figma.getNodeByIdAsync(id)
    const linked = node && !node.removed ? linkOf(node) : null
    if (!linked) continue
    const frame = await figma.getNodeByIdAsync(linked.nodeId)
    const page = frame ? pageOf(frame) : null
    if (!frame || frame.type !== 'FRAME' || !page) continue
    const next = { ...linked.link, sent: label }
    writeLink(frame, next)
    drawNote(page, frame, next, f, notesByFrame(page).get(frame.id))
  }
}

// linkOf finds the post a node is linked to: its own link or its nearest
// linked ancestor's.
export function linkOf(node: BaseNode): { nodeId: string; link: FrameLink } | null {
  for (let n: BaseNode | null = node; n && n.type !== 'PAGE' && n.type !== 'DOCUMENT'; n = n.parent) {
    const link = parseLink(n.getPluginData(DATA_KEYS.link))
    if (link) return { nodeId: n.id, link }
  }
  return null
}

// currentBoard is the campaign of the current page's board, if it is one.
export function currentBoard(): { campaignId: string; copy: boolean } | null {
  const meta = parseMeta(figma.currentPage.getPluginData(DATA_KEYS.board))
  return meta ? { campaignId: meta.campaignId, copy: meta.pageId !== figma.currentPage.id } : null
}

// ── helpers ─────────────────────────────────────────────────────────────────

function linkedFrames(page: PageNode, campaignId: string): Array<{ node: FrameNode; link: FrameLink }> {
  const out: Array<{ node: FrameNode; link: FrameLink }> = []
  for (const node of page.findAllWithCriteria({ types: ['FRAME'], pluginData: { keys: [DATA_KEYS.link] } })) {
    const link = parseLink(node.getPluginData(DATA_KEYS.link))
    if (link && link.campaignId === campaignId) out.push({ node, link })
  }
  return out
}

function notesByFrame(page: PageNode): Map<string, TextNode> {
  const out = new Map<string, TextNode>()
  for (const { node, tag: t } of findTagged(page, (t) => t.kind === 'note')) {
    if (t.kind === 'note' && node.type === 'TEXT') out.set(t.frameId, node)
  }
  return out
}

function findTagged(page: PageNode, match: (t: GridTag) => boolean): Array<{ node: SceneNode; tag: GridTag }> {
  const out: Array<{ node: SceneNode; tag: GridTag }> = []
  for (const node of page.children) {
    const t = parseTag(node.getPluginData(DATA_KEYS.grid))
    if (t && match(t)) out.push({ node, tag: t })
  }
  return out
}

function tag(node: SceneNode, t: GridTag) {
  node.setPluginData(DATA_KEYS.grid, JSON.stringify(t))
}

function writeLink(node: FrameNode, link: FrameLink) {
  node.setPluginData(DATA_KEYS.link, JSON.stringify(link))
}

function writeMeta(page: PageNode, meta: BoardMeta) {
  page.setPluginData(DATA_KEYS.board, JSON.stringify(meta))
}

function absolute(node: SceneNode): { x: number; y: number } {
  const t = node.absoluteTransform
  return { x: t[0][2], y: t[1][2] }
}

function pageOf(node: BaseNode): PageNode | null {
  let n: BaseNode | null = node
  while (n && n.type !== 'PAGE') n = n.parent
  return n
}
