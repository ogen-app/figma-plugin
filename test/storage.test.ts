import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS, parsePrefs, parseSession } from '../src/ui/storage'

describe('parseSession', () => {
  it('accepts a stored pairing result', () => {
    const s = parseSession({ token: 'ogp_abc', workspace: { id: 'w1', name: 'Acme' }, user: { id: 'u1', name: 'Jane' } })
    expect(s).toEqual({ token: 'ogp_abc', workspace: { id: 'w1', name: 'Acme' }, user: { id: 'u1', name: 'Jane' } })
  })

  it.each([undefined, null, 'ogp_x', {}, { token: 'not-a-plugin-token' }])('rejects %j', (v) => {
    expect(parseSession(v)).toBeNull()
  })
})

describe('parsePrefs', () => {
  it('keeps valid values and defaults the rest', () => {
    expect(parsePrefs({ format: 'JPG', scale: 3 })).toEqual({ ...DEFAULT_PREFS, format: 'JPG', scale: 3 })
    expect(parsePrefs({ video: true, videoFormat: 'WEBM', videoQuality: 'LOW', videoScale: 2 })).toEqual({
      ...DEFAULT_PREFS,
      video: true,
      videoFormat: 'WEBM',
      videoQuality: 'LOW',
      videoScale: 2,
    })
    expect(parsePrefs({ video: 'yes', videoFormat: 'GIF', videoQuality: 'ULTRA', videoScale: 3 })).toEqual(DEFAULT_PREFS)
    expect(parsePrefs({ format: 'SVG', scale: 4 })).toEqual(DEFAULT_PREFS)
    expect(parsePrefs(undefined)).toEqual(DEFAULT_PREFS)
  })
})
