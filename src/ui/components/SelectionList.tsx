import type { Limits } from '../../api/types'
import type { Scale, SelectionItem } from '../../shared/messages'
import { outputSize, pixelWarning } from '../../queue/preflight'

export interface SelectionListProps {
  items: SelectionItem[]
  skipped: number
  thumbnails: Record<string, string>
  scale: Scale
  limits: Limits
}

export function SelectionList({ items, skipped, thumbnails, scale, limits }: SelectionListProps) {
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
          const size = outputSize(item, scale)
          const warning = pixelWarning(item, scale, limits)
          const thumb = thumbnails[item.id]
          return (
            <li key={item.id} class="item">
              <div class="thumb">{thumb ? <img src={thumb} alt="" /> : null}</div>
              <div class="item-body">
                <div class="item-name" title={item.name}>
                  {item.name}
                </div>
                <div class="muted">
                  {size.width} × {size.height} px
                </div>
                {warning && <div class="warning">{warning}</div>}
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
