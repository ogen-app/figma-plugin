import type { VideoRules } from '../../api/campaigns'
import type { Limits } from '../../api/types'
import { isVideoExportable, type Scale, type SelectionItem, type VideoScale } from '../../shared/messages'
import { formatSeconds, outputSize, pixelWarning, videoWarnings } from '../../queue/preflight'

export interface SelectionListProps {
  items: SelectionItem[]
  skipped: number
  thumbnails: Record<string, string>
  scale: Scale
  limits: Limits
  // Set while sending as video: the video scale and each item's target post
  // rules.
  video: { scale: VideoScale; rulesFor: (item: SelectionItem) => VideoRules | null | undefined } | null
  // Board links are in use: placeholders still holding only their image
  // from Ogen are held back (CON-357).
  heldBack?: boolean
  onSelectNode: (nodeId: string) => void
}

export function SelectionList({ items, skipped, thumbnails, scale, limits, video, heldBack = false, onSelectNode }: SelectionListProps) {
  if (items.length === 0) {
    return (
      <div class="empty">
        <p>Select one or more frames</p>
        <p class="muted">
          {skipped > 0 ? 'The selected layers are not frames, components, groups or sections.' : 'Frames, components, instances, groups and sections can be sent.'}
        </p>
      </div>
    )
  }
  return (
    <div class="selection">
      <ul class="items">
        {items.map((item) => {
          const anim = item.animation
          const exportable = isVideoExportable(item)
          const size = outputSize(item, video && exportable ? video.scale : scale)
          const warnings = video
            ? exportable
              ? videoWarnings(item, video.rulesFor(item))
              : []
            : [pixelWarning(item, scale, limits)].filter((w): w is string => w !== null)
          const thumb = thumbnails[item.id]
          const unchanged = heldBack && item.seededUnchanged
          return (
            <li key={item.id} class={(video && !exportable) || unchanged ? 'item dimmed' : 'item'}>
              <div class="thumb">{thumb ? <img src={thumb} alt="" /> : null}</div>
              <div class="item-body">
                <div class="item-name" title={item.name}>
                  {item.name}
                </div>
                <div class="muted">
                  {size.width} × {size.height} px
                  {anim && exportable && (
                    <span class="pill info anim-pill" title="Animated with Figma Motion">
                      ▶ Animated{anim.durationSec > 0 ? ` · ${formatSeconds(anim.durationSec)}` : ''}
                    </span>
                  )}
                </div>
                {anim && !exportable && (
                  <div class="muted small">
                    Animated inside “{anim.frame.name}”. Video exports the whole frame.{' '}
                    <button class="link" onClick={() => onSelectNode(anim.frame.id)}>
                      Use frame
                    </button>
                  </div>
                )}
                {unchanged && <div class="muted small">Unchanged image from Ogen: already on its post, won't be sent again.</div>}
                {warnings.map((w) => (
                  <div key={w} class="warning">
                    {w}
                  </div>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
      {skipped > 0 && (
        <p class="muted small">
          {skipped} other selected {skipped === 1 ? 'layer is' : 'layers are'} not a frame and won't be sent.
        </p>
      )}
    </div>
  )
}
