import { describe, expect, it } from 'vitest'
import { animationInfo, type MotionNode } from '../src/main/animation'

const still = (children: MotionNode[] = []): MotionNode => ({ timelines: [], animationStyles: [], animations: {}, manualKeyframeTracks: {}, children })

describe('animationInfo', () => {
  it('reports a static tree as not animated', () => {
    expect(animationInfo(still([still(), still([still()])]))).toEqual({ animated: false, durationSec: 0 })
  })

  it('finds keyframes deep in the tree and takes the longest timeline', () => {
    const tree = still([
      still([{ ...still(), timelines: [{ duration: 1.5 }], animations: { TRANSLATION_X: {} } }]),
      { ...still(), timelines: [{ duration: 4 }, { duration: 2 }] },
    ])
    expect(animationInfo(tree)).toEqual({ animated: true, durationSec: 4 })
  })

  it.each([
    ['an animation style', { animationStyles: [{ id: 's' }] }],
    ['keyframe bindings', { animations: { OPACITY: {} } }],
    ['manual keyframes', { manualKeyframeTracks: { ROTATION: {} } }],
  ])('counts %s as animated', (_, over) => {
    expect(animationInfo(still([{ ...still(), ...over }])).animated).toBe(true)
  })

  it('treats nodes without Motion fields (older Figma) as static', () => {
    expect(animationInfo({ children: [{}, { children: [{}] }] })).toEqual({ animated: false, durationSec: 0 })
  })

  it('survives a getter that throws', () => {
    const node = {
      get timelines(): never {
        throw new Error('not supported')
      },
      children: [{ ...still(), timelines: [{ duration: 2 }] }],
    }
    expect(animationInfo(node)).toEqual({ animated: true, durationSec: 2 })
  })

  it('gives up past the node cap', () => {
    const children = Array.from({ length: 10 }, (_, i) => (i === 9 ? { ...still(), timelines: [{ duration: 3 }] } : still()))
    const wide = still(children)
    expect(animationInfo(wide, 5)).toEqual({ animated: false, durationSec: 0 })
    expect(animationInfo(wide, 11)).toEqual({ animated: true, durationSec: 3 })
  })
})
