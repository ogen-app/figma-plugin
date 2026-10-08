import { describe, expect, it } from 'vitest'
import { DEFAULT_LIMITS } from '../src/api/types'
import type { SelectionItem } from '../src/shared/messages'
import { aspectRatioAllowed, bytesWarning, formatBytes, formatSeconds, outputSize, pixelWarning, videoBytesWarning, videoWarnings } from '../src/queue/preflight'

const frame = (width: number, height: number): SelectionItem => ({ id: '1:2', name: 'Hero', type: 'FRAME', width, height, x: 0, y: 0 })

describe('preflight', () => {
  it('computes the exported size', () => {
    expect(outputSize(frame(1440, 900.4), 2)).toEqual({ width: 2880, height: 1801, pixels: 2880 * 1801 })
    expect(outputSize(frame(0.2, 0.2), 1)).toEqual({ width: 1, height: 1, pixels: 1 })
  })

  it('warns above the pixel cap and suggests a scale that fits', () => {
    expect(pixelWarning(frame(1440, 900), 3, DEFAULT_LIMITS)).toBeNull()
    expect(pixelWarning(frame(5000, 5000), 3, DEFAULT_LIMITS)).toBe('225 MP at 3× is over the 100 MP limit. Try 2×.')
    expect(pixelWarning(frame(12000, 12000), 1, DEFAULT_LIMITS)).toMatch(/Split the frame/)
  })

  it('warns above the byte cap', () => {
    expect(bytesWarning(1024, DEFAULT_LIMITS)).toBeNull()
    expect(bytesWarning(60 * 1024 * 1024, DEFAULT_LIMITS)).toBe('60 MB is over the 50 MB limit. Try JPG or a lower scale.')
  })

  it('formats bytes', () => {
    expect([formatBytes(512), formatBytes(2048), formatBytes(1.5 * 1024 * 1024)]).toEqual(['512 B', '2 KB', '1.5 MB'])
  })

  it('warns about a video over the byte cap', () => {
    expect(videoBytesWarning(10 * 1024 * 1024, DEFAULT_LIMITS)).toBeNull()
    expect(videoBytesWarning(300 * 1024 * 1024, DEFAULT_LIMITS)).toBe('300 MB is over the 200 MB video limit. Try lower quality or 1×.')
  })
})

describe('video preflight', () => {
  const reel: SelectionItem = {
    ...frame(1080, 1920),
    animation: { durationSec: 75.4, frame: { id: '1:2', name: 'Hero', width: 1080, height: 1920 } },
  }

  it('checks nothing when the API sent no rules', () => {
    expect(videoWarnings(reel, undefined)).toEqual([])
  })

  it('says when the post takes no video', () => {
    expect(videoWarnings(reel, null)).toEqual(["This post can't take a video."])
  })

  it('checks duration and aspect ratio', () => {
    expect(videoWarnings(reel, { max_duration_seconds: 90, allowed_aspect_ratios: ['9:16'], max_per_post: 1 })).toEqual([])
    expect(videoWarnings(reel, { max_duration_seconds: 60, allowed_aspect_ratios: ['1:1', '16:9'], max_per_post: 0 })).toEqual([
      '1:15 is longer than the 1:00 this post allows.',
      "The frame's shape doesn't fit this post (allowed: 1:1, 16:9).",
    ])
  })

  it('matches aspect ratios within 2% like the server', () => {
    expect(aspectRatioAllowed(1080, 1350, ['4:5'])).toBe(true)
    expect(aspectRatioAllowed(1080, 1330, ['4:5'])).toBe(true)
    expect(aspectRatioAllowed(1080, 1080, ['4:5', 'x:y'])).toBe(false)
    expect(aspectRatioAllowed(0, 100, ['1:1'])).toBe(true)
  })

  it('formats durations', () => {
    expect([formatSeconds(3), formatSeconds(6.24), formatSeconds(59.96), formatSeconds(125)]).toEqual(['3s', '6.2s', '1:00', '2:05'])
  })
})
