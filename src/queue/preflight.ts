import type { VideoRules } from '../api/campaigns'
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

// videoBytesWarning explains why a rendered video is too big to upload.
export function videoBytesWarning(bytes: number, limits: Limits): string | null {
  if (bytes <= limits.max_video_bytes) return null
  return `${formatBytes(bytes)} is over the ${formatBytes(limits.max_video_bytes)} video limit. Try lower quality or 1×.`
}

// videoWarnings lists the ways an item's animation breaks the target post's
// video rules. Advisory: the server validates the real file.
export function videoWarnings(item: SelectionItem, rules: VideoRules | null | undefined): string[] {
  const anim = item.animation
  if (!anim || rules === undefined) return []
  if (rules === null) return ["This post can't take a video."]
  const out: string[] = []
  const max = rules.max_duration_seconds
  if (max > 0 && anim.durationSec > max) {
    out.push(`${formatSeconds(anim.durationSec)} is longer than the ${formatSeconds(max)} this post allows.`)
  }
  const { width, height } = anim.frame
  if (rules.allowed_aspect_ratios.length > 0 && !aspectRatioAllowed(width, height, rules.allowed_aspect_ratios)) {
    out.push(`The frame's shape doesn't fit this post (allowed: ${rules.allowed_aspect_ratios.join(', ')}).`)
  }
  return out
}

// aspectRatioAllowed mirrors the server's check: within 2% of a listed ratio.
export function aspectRatioAllowed(w: number, h: number, allowed: string[]): boolean {
  if (w <= 0 || h <= 0) return true
  const actual = w / h
  return allowed.some((r) => {
    const [a, b] = r.split(':').map((p) => Number.parseInt(p.trim(), 10))
    if (!a || !b || a <= 0 || b <= 0) return false
    const want = a / b
    return Math.abs(actual - want) / want <= 0.02
  })
}

export function formatSeconds(sec: number): string {
  const tenths = Math.round(sec * 10) / 10
  if (tenths < 60) return `${tenths}s`
  const total = Math.round(sec)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
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
