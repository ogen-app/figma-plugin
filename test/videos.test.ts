import { describe, expect, it } from 'vitest'
import { toCampaigns } from '../src/api/campaigns'
import { createApiClient } from '../src/api/client'
import { sendVideo } from '../src/api/videos'
import { fakeFetch, json } from './helpers'

const input = {
  bytes: new Uint8Array([0, 0, 0, 24]),
  format: 'MP4' as const,
  nodeId: '12:345',
  nodeName: ' Launch reel ',
  fileName: 'Brand',
  postId: 'p/1',
}

describe('sendVideo', () => {
  it('presigns, uploads to storage, then finalizes', async () => {
    const f = fakeFetch(
      json(200, { upload_url: 'https://r2.example/b/key?sig', s3_key: 'acme/post-attachments/p1/x.mp4', expires_in: 1800 }),
      new Response(null, { status: 200 }),
      json(201, {
        attachment: { id: 'att1', post_id: 'p1', mime_type: 'video/mp4', duration_ms: 6200, width: 1080, height: 1920 },
        platform_validation: [{ rule: 'max_duration_seconds', message: 'video is 6s long; platform allows up to 3s' }, { rule: 'x' }],
        open_url: 'https://app/posts/p1',
      }),
    )
    const api = createApiClient({ baseUrl: 'http://api.test', getToken: () => 'ogp_t', fetchImpl: f.fetch })
    const res = await sendVideo(api, input)

    expect(f.calls.map((c) => [c.init.method, c.url])).toEqual([
      ['POST', 'http://api.test/api/plugins/figma/posts/p%2F1/videos/presign'],
      ['PUT', 'https://r2.example/b/key?sig'],
      ['POST', 'http://api.test/api/plugins/figma/posts/p%2F1/videos/finalize'],
    ])
    expect(JSON.parse(f.calls[0]!.init.body as string)).toEqual({ content_type: 'video/mp4', size_bytes: 4 })
    const put = f.calls[1]!.init
    expect((put.headers as Record<string, string>).Authorization).toBeUndefined()
    expect((put.body as Blob).size).toBe(4)
    expect(JSON.parse(f.calls[2]!.init.body as string)).toEqual({
      s3_key: 'acme/post-attachments/p1/x.mp4',
      node_id: '12:345',
      node_name: 'Launch reel',
      file_name: 'Brand',
    })
    expect(res).toEqual({
      kind: 'video',
      attachment: { id: 'att1', post_id: 'p1', duration_ms: 6200, width: 1080, height: 1920 },
      platform_validation: [{ rule: 'max_duration_seconds', message: 'video is 6s long; platform allows up to 3s' }],
      open_url: 'https://app/posts/p1',
    })
  })

  it('does not finalize when the storage upload fails', async () => {
    const f = fakeFetch(json(200, { upload_url: 'https://r2.example/k', s3_key: 'k' }), new Response(null, { status: 403 }))
    const api = createApiClient({ baseUrl: 'http://api.test', getToken: () => 'ogp_t', fetchImpl: f.fetch })
    await expect(sendVideo(api, { ...input, format: 'WEBM' })).rejects.toMatchObject({ status: 400, code: 'upload_failed' })
    expect(f.calls).toHaveLength(2)
    expect(JSON.parse(f.calls[0]!.init.body as string).content_type).toBe('video/webm')
  })

  it('refuses a presign response without an upload URL', async () => {
    const f = fakeFetch(json(200, {}))
    const api = createApiClient({ baseUrl: 'http://api.test', getToken: () => 'ogp_t', fetchImpl: f.fetch })
    await expect(sendVideo(api, input)).rejects.toThrow('Ogen did not return an upload URL.')
  })
})

describe('campaign post video rules', () => {
  const posts = (...extra: object[]) =>
    toCampaigns({ campaigns: [{ id: 'c', posts: extra.map((e, i) => ({ id: `p${i}`, ...e })) }] })[0]!.posts

  it('distinguishes no rules sent, no video allowed, and rules', () => {
    const [unknown, none, rules] = posts(
      {},
      { video: null },
      { video: { max_duration_seconds: 90, allowed_aspect_ratios: ['9:16', 4], max_per_post: 1 } },
    )
    expect(unknown!.video).toBeUndefined()
    expect(none!.video).toBeNull()
    expect(rules!.video).toEqual({ max_duration_seconds: 90, allowed_aspect_ratios: ['9:16'], max_per_post: 1 })
  })
})
