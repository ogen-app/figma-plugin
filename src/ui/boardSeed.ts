import type { BoardPlan, PlannedSeed, SeedTarget } from '../shared/board'

// Placing media from Ogen in a board's placeholders (CON-357): the UI fetches
// each Figma-ready copy (it has the network) and main sets it as the frame's
// fill, one image at a time.

export interface SeedJob {
  nodeId: string
  seed: PlannedSeed
}

// seedJobs pairs the frames that can take media with what the plan says goes
// in them.
export function seedJobs(plan: BoardPlan, targets: SeedTarget[]): SeedJob[] {
  const slots = new Map<string, PlannedSeed>()
  for (const post of plan.posts) {
    for (const slot of post.slots) if (slot.seed) slots.set(`${post.postId}:${slot.slot}`, slot.seed)
  }
  const out: SeedJob[] = []
  for (const t of targets) {
    const seed = slots.get(`${t.postId}:${t.slot}`)
    if (seed) out.push({ nodeId: t.nodeId, seed })
  }
  return out
}

export interface SeedDeps {
  fetchBytes: (url: string, signal: AbortSignal) => Promise<Uint8Array>
  setImage: (job: SeedJob, bytes: Uint8Array) => Promise<void>
}

export interface SeedOutcome {
  placed: number
  // Frames whose media couldn't be fetched or placed.
  failed: string[]
  cancelled: boolean
}

// runSeeds places each job's media in order. The next download runs while the
// current image is placed; a failure is counted and the rest go on.
export async function runSeeds(jobs: SeedJob[], deps: SeedDeps, onProgress: (done: number, total: number) => void, signal: AbortSignal): Promise<SeedOutcome> {
  const out: SeedOutcome = { placed: 0, failed: [], cancelled: false }
  const fetchOf = (job: SeedJob) => deps.fetchBytes(job.seed.url, signal)
  // Settled promises, so a prefetch failing before its turn isn't unhandled.
  const settle = (p: Promise<Uint8Array>) => p.then((bytes) => ({ bytes }), (error: unknown) => ({ error }))
  let next = jobs[0] ? settle(fetchOf(jobs[0])) : null
  onProgress(0, jobs.length)
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]!
    const got = await next!
    next = jobs[i + 1] && !signal.aborted ? settle(fetchOf(jobs[i + 1]!)) : null
    if (signal.aborted) {
      out.cancelled = true
      break
    }
    try {
      if ('error' in got) throw got.error
      await deps.setImage(job, got.bytes)
      out.placed++
    } catch {
      out.failed.push(job.nodeId)
    }
    onProgress(i + 1, jobs.length)
  }
  return out
}

// fetchBytes downloads a presigned media URL. It carries no Ogen token.
export async function fetchBytes(url: string, signal: AbortSignal): Promise<Uint8Array> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

// seedSummary is e.g. "10 with media from Ogen. 1 image could not be loaded."
export function seedSummary(o: SeedOutcome): string {
  const parts: string[] = []
  if (o.placed > 0) parts.push(`${o.placed} with media from Ogen.`)
  if (o.failed.length > 0) parts.push(o.failed.length === 1 ? '1 image could not be loaded.' : `${o.failed.length} images could not be loaded.`)
  if (o.cancelled) parts.push('Placing images was cancelled.')
  return parts.join(' ')
}
