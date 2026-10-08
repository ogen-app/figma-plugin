import { readingOrder } from '../shared/board'
import type { SelectionItem } from '../shared/messages'
import type { PostTarget } from './types'

// Sending board placeholders (CON-354): each linked frame goes to its own
// post, and a post's frames go in reading order, so carousel slides keep
// the order they have on the canvas.

export interface LinkedGroup {
  target: PostTarget
  items: SelectionItem[]
}

export interface LinkedSend {
  // Items with no link: they go wherever the user picks.
  unlinked: SelectionItem[]
  // Linked items by post, in the order the posts first appear.
  groups: LinkedGroup[]
  // Linked to a post that isn't in Ogen's campaign list any more.
  missing: SelectionItem[]
  // Linked to a post that was submitted and can't take new media.
  locked: SelectionItem[]
  // Groups with more frames than their post takes.
  crowded: LinkedGroup[]
}

// resolveLinks splits a selection by the posts its items are linked to.
// targets maps post ids to posts; null means they are still loading, which
// leaves every linked item in no group yet.
export function resolveLinks(items: SelectionItem[], targets: Map<string, PostTarget> | null): LinkedSend {
  const out: LinkedSend = { unlinked: [], groups: [], missing: [], locked: [], crowded: [] }
  const groups = new Map<string, LinkedGroup>()
  for (const item of items) {
    if (!item.link) {
      out.unlinked.push(item)
      continue
    }
    if (!targets) continue
    const target = targets.get(item.link.postId)
    if (!target) {
      out.missing.push(item)
      continue
    }
    if (target.attachable === false) {
      out.locked.push(item)
      continue
    }
    let group = groups.get(target.id)
    if (!group) {
      group = { target, items: [] }
      groups.set(target.id, group)
      out.groups.push(group)
    }
    group.items.push(item)
  }
  for (const g of out.groups) {
    g.items.sort(readingOrder)
    const max = g.target.maxAttachments
    if (typeof max === 'number' && max > 0 && g.items.length > max) out.crowded.push(g)
  }
  return out
}

// linkedTargets maps each grouped item to its post, for SendRequest.linked.
export function linkedTargets(groups: LinkedGroup[]): Record<string, PostTarget> {
  const out: Record<string, PostTarget> = {}
  for (const g of groups) for (const item of g.items) out[item.id] = g.target
  return out
}
