// Detects Figma Motion animation in a layer tree (CON-347). Kept free of the
// figma global so tests can feed it plain objects.

// MotionNode is the slice of a SceneNode the walk reads. Every field is
// optional: Figma clients without Motion don't have them.
export interface MotionNode {
  readonly timelines?: ReadonlyArray<{ readonly duration: number }>
  readonly animationStyles?: ReadonlyArray<unknown>
  readonly animations?: object
  readonly manualKeyframeTracks?: object
  readonly children?: ReadonlyArray<MotionNode>
}

export interface AnimationInfo {
  animated: boolean
  // Longest timeline seen, in seconds.
  durationSec: number
}

// A frame with more layers than this is reported as not animated rather than
// stalling selection updates. Figma would still export it; the user can't.
export const MAX_WALK_NODES = 5000

// animationInfo walks node and its descendants for Motion timelines,
// keyframes or animation styles.
export function animationInfo(node: MotionNode, maxNodes = MAX_WALK_NODES): AnimationInfo {
  let animated = false
  let durationSec = 0
  let visited = 0
  const stack: MotionNode[] = [node]
  while (stack.length > 0) {
    if (++visited > maxNodes) return { animated: false, durationSec: 0 }
    const n = stack.pop()!
    let timelines: ReadonlyArray<{ duration: number }> = []
    try {
      timelines = n.timelines ?? []
      if (timelines.length > 0 || hasEntries(n.animationStyles) || hasEntries(n.animations) || hasEntries(n.manualKeyframeTracks)) {
        animated = true
      }
    } catch {
      // A getter Figma doesn't support on this node type.
    }
    for (const t of timelines) {
      if (Number.isFinite(t.duration) && t.duration > durationSec) durationSec = t.duration
    }
    if (n.children) for (const c of n.children) stack.push(c)
  }
  return { animated, durationSec }
}

function hasEntries(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0
  return typeof v === 'object' && v !== null && Object.keys(v).length > 0
}
