import { useEffect, useRef, useState } from 'preact/hooks'
import type { SelectionItem } from '../../shared/messages'
import type { Bridge } from '../bridge'

export interface Selection {
  items: SelectionItem[]
  skipped: number
  // Object URLs of rendered thumbnails, by node id.
  thumbnails: Record<string, string>
}

// useSelection mirrors the Figma selection pushed by main, with thumbnails.
export function useSelection(bridge: Bridge): Selection {
  const [selection, setSelection] = useState<Omit<Selection, 'thumbnails'>>({ items: [], skipped: 0 })
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const urls = useRef(thumbnails)
  urls.current = thumbnails

  useEffect(() => {
    const unsubscribe = bridge.subscribe((msg) => {
      if (msg.type === 'selection') {
        setSelection({ items: msg.items, skipped: msg.skipped })
        const keep = new Set(msg.items.map((i) => i.id))
        setThumbnails((prev) => {
          const next: Record<string, string> = {}
          for (const [id, url] of Object.entries(prev)) {
            if (keep.has(id)) next[id] = url
            else URL.revokeObjectURL(url)
          }
          return next
        })
      } else if (msg.type === 'thumbnail') {
        const url = URL.createObjectURL(new Blob([msg.bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' }))
        setThumbnails((prev) => {
          const old = prev[msg.id]
          if (old) URL.revokeObjectURL(old)
          return { ...prev, [msg.id]: url }
        })
      }
    })
    bridge.send({ type: 'request-selection' })
    return () => {
      unsubscribe()
      for (const url of Object.values(urls.current)) URL.revokeObjectURL(url)
    }
  }, [bridge])

  return { ...selection, thumbnails }
}
