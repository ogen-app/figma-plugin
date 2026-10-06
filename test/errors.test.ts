import { describe, expect, it } from 'vitest'
import { ApiError } from '../src/api/client'
import { errorMessage, UPGRADE_HINT, upgradeHint } from '../src/queue/errors'

describe('errorMessage', () => {
  it('maps known codes', () => {
    expect(errorMessage(new ApiError(415, 'vector_rejected', 'SVG is not supported'))).toBe('SVG is not supported. Send as PNG or JPG.')
    expect(errorMessage(new ApiError(0, 'network_error', 'x'))).toBe('Could not reach Ogen. Check your connection.')
    expect(errorMessage(new ApiError(0, 'storage_network_error', 'x'))).toBe('Could not reach Ogen storage. Check your connection.')
  })

  it('names the exhausted quota', () => {
    const media = new ApiError(402, 'entitlement_exceeded', 'x', undefined, { feature: 'media_storage_bytes' })
    expect(errorMessage(media)).toBe('Your workspace has reached its media storage limit.')
    expect(errorMessage(new ApiError(402, undefined, 'x', undefined, {}))).toBe('Your workspace has reached a plan limit.')
  })

  it('falls back to the server message for unknown 4xx and a generic one for 5xx', () => {
    expect(errorMessage(new ApiError(400, undefined, 'node_name is required'))).toBe('node_name is required')
    expect(errorMessage(new ApiError(500, undefined, 'pq: boom'))).toBe('Something went wrong in Ogen. Try again.')
  })
})

describe('upgradeHint', () => {
  it('uses the server upgrade_url when present', () => {
    expect(upgradeHint(new ApiError(402, undefined, 'x', undefined, { upgrade_url: 'https://app/billing' }))).toEqual({
      text: 'Upgrade your plan',
      url: 'https://app/billing',
    })
    expect(upgradeHint(new ApiError(402, undefined, 'x'))).toEqual({ text: UPGRADE_HINT })
  })
})
