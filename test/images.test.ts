import { describe, expect, it } from 'vitest'
import { createApiClient } from '../src/api/client'
import { sendImage } from '../src/api/images'
import { fakeFetch, json } from './helpers'

describe('sendImage', () => {
  it('posts multipart with the frame metadata', async () => {
    const f = fakeFetch(json(201, { asset: { id: 'a1', title: 'Hero' }, deduplicated: true, attachment: null, attach_error: null, open_url: 'https://app/x' }))
    const api = createApiClient({ baseUrl: 'http://api.test', getToken: () => 'ogp_t', fetchImpl: f.fetch })
    const res = await sendImage(api, {
      bytes: new Uint8Array([137, 80, 78, 71]),
      format: 'PNG',
      nodeId: '12:345',
      nodeName: '  Hero / Desktop ',
      fileName: 'Brand',
      postId: 'p1',
    })
    const body = f.calls[0]!.init.body as FormData
    expect(f.calls[0]!.url).toBe('http://api.test/api/plugins/figma/images')
    expect(body.get('node_id')).toBe('12:345')
    expect(body.get('node_name')).toBe('Hero / Desktop')
    expect(body.get('file_name')).toBe('Brand')
    expect(body.get('post_id')).toBe('p1')
    const file = body.get('file') as File
    expect(file.type).toBe('image/png')
    expect(file.size).toBe(4)
    expect(res).toMatchObject({ deduplicated: true, open_url: 'https://app/x', attachment: null })
  })

  it('falls back to the node id for an unnamed frame and omits empty optionals', async () => {
    const f = fakeFetch(json(201, {}))
    const api = createApiClient({ baseUrl: 'http://api.test', getToken: () => 'ogp_t', fetchImpl: f.fetch })
    await sendImage(api, { bytes: new Uint8Array(1), format: 'JPG', nodeId: '1:2', nodeName: ' ', fileName: '' })
    const body = f.calls[0]!.init.body as FormData
    expect(body.get('node_name')).toBe('Frame 1:2')
    expect(body.has('file_name')).toBe(false)
    expect(body.has('post_id')).toBe(false)
    expect((body.get('file') as File).type).toBe('image/jpeg')
  })
})
