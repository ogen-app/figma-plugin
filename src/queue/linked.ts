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
  // Linked to a post its campaign no longer has (or a deleted campaign).
  missing: SelectionItem[]
  // Linked to a post that was submitted and can't take new media.
  locked: SelectionItem[]
  // Groups with more frames than their post takes.
  crowded: LinkedGroup[]
}

// LinkTargets are the posts linked frames can go to, from their campaigns.
export interface LinkTargets {
  byId: Map<string, PostTarget>
  // Campaigns whose full post list was read (or that are gone from Ogen):
  // a post missing from them is really gone.
  complete: Set<string>
}

// resolveLinks splits a selection by the posts its items are linked to.
// targets null means they are still loading, which leaves every linked item
// in no group yet. A post that isn't found in a campaign whose list may be
// cut short is still sent to by id: the server decides.
export function resolveLinks(items: SelectionItem[], targets: LinkTargets | null): LinkedSend {
  const out: LinkedSend = { unlinked: [], groups: [], missing: [], locked: [], crowded: [] }
  const groups = new Map<string, LinkedGroup>()
  for (const item of items) {
    if (!item.link) {
      out.unlinked.push(item)
      continue
    }
    if (!targets) continue
    const target = targets.byId.get(item.link.postId) ?? unlistedTarget(item, targets.complete)
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

// unlistedTarget is the post of a link that its campaign's (possibly cut
// short) list doesn't show, known only by id.
function unlistedTarget(item: SelectionItem, complete: Set<string>): PostTarget | null {
  const link = item.link!
  if (complete.has(link.campaignId)) return null
  return { id: link.postId, title: item.name, campaignName: '', platformName: '', detail: 'Not in the campaign list; Ogen checks it on send' }
}

// linkedTargets maps each grouped item to its post, for SendRequest.linked.
export function linkedTargets(groups: LinkedGroup[]): Record<string, PostTarget> {
  const out: Record<string, PostTarget> = {}
  for (const g of groups) for (const item of g.items) out[item.id] = g.target
  return out
}
