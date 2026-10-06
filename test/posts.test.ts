import { describe, expect, it } from 'vitest'
import { createApiClient } from '../src/api/client'
import { listPosts } from '../src/api/posts'
import { fakeFetch, json } from './helpers'

describe('listPosts', () => {
  it('queries by title and normalizes the response', async () => {
    const f = fakeFetch(
      json(200, {
        posts: [
          { id: 'p1', title: 'Launch', platform: 'linkedin', campaign: { id: 'c1', name: 'Q4' }, attachment_count: 2 },
          { id: 'p2', title: 'Teaser', campaign: null },
          { title: 'no id' },
        ],
      }),
    )
    const api = createApiClient({ baseUrl: 'http://api.test', getToken: () => 'ogp_t', fetchImpl: f.fetch })
    const posts = await listPosts(api, ' launch ')
    expect(f.calls[0]!.url).toBe('http://api.test/api/plugins/figma/posts?limit=20&q=launch')
    expect(posts.map((p) => [p.id, p.campaign?.name ?? null, p.attachment_count])).toEqual([
      ['p1', 'Q4', 2],
      ['p2', null, 0],
    ])
  })

  it('treats a missing posts array as empty', async () => {
    const f = fakeFetch(json(200, { posts: null }))
    const api = createApiClient({ baseUrl: 'http://api.test', getToken: () => 'ogp_t', fetchImpl: f.fetch })
    await expect(listPosts(api, '')).resolves.toEqual([])
  })
})
