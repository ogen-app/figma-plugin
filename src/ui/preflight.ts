import type { Limits } from '../api/types'
import type { Scale, SelectionItem } from '../shared/messages'

export interface OutputSize {
  width: number
  height: number
  pixels: number
}

// outputSize is the exported image's size: Figma renders SCALE exports at
// round(dimension * scale).
export function outputSize(item: Pick<SelectionItem, 'width' | 'height'>, scale: Scale): OutputSize {
  const width = Math.max(1, Math.round(item.width * scale))
  const height = Math.max(1, Math.round(item.height * scale))
  return { width, height, pixels: width * height }
}

// pixelWarning explains why an export would be rejected for its pixel area,
// or returns null when it fits.
export function pixelWarning(item: SelectionItem, scale: Scale, limits: Limits): string | null {
  const { pixels } = outputSize(item, scale)
  if (pixels <= limits.max_image_pixels) return null
  const fits = ([3, 2, 1] as const).find((s) => s < scale && outputSize(item, s).pixels <= limits.max_image_pixels)
  const hint = fits ? ` Try ${fits}×.` : ' Split the frame or reduce its size.'
  return `${formatMegapixels(pixels)} at ${scale}× is over the ${formatMegapixels(limits.max_image_pixels)} limit.${hint}`
}

// bytesWarning explains why an exported file is too big to upload.
export function bytesWarning(bytes: number, limits: Limits): string | null {
  if (bytes <= limits.max_image_bytes) return null
  return `${formatBytes(bytes)} is over the ${formatBytes(limits.max_image_bytes)} limit. Try JPG or a lower scale.`
}

export function formatMegapixels(pixels: number): string {
  const mp = pixels / 1_000_000
  return `${mp >= 10 ? Math.round(mp) : mp.toFixed(1)} MP`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  const mb = bytes / (1024 * 1024)
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`
}
