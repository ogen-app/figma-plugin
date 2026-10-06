import { describe, expect, it } from 'vitest'
import { DEFAULT_LIMITS } from '../src/api/types'
import type { SelectionItem } from '../src/shared/messages'
import { bytesWarning, formatBytes, outputSize, pixelWarning } from '../src/queue/preflight'

const frame = (width: number, height: number): SelectionItem => ({ id: '1:2', name: 'Hero', type: 'FRAME', width, height })

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
})
