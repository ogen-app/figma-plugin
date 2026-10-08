import { describe, expect, it } from 'vitest'
import { createApiClient } from '../src/api/client'
import { fetchCampaign } from '../src/ui/boardSync'
import { fakeFetch, json } from './helpers'

const api = (...responses: Response[]) => {
  const f = fakeFetch(...responses)
  return { api: createApiClient({ baseUrl: 'http://api.test', getToken: () => 'ogp_t', fetchImpl: f.fetch }), calls: f.calls }
}

const campaign = (id: string, posts = 1) => ({ id, name: id, posts: Array.from({ length: posts }, (_, i) => ({ id: `p${i}` })) })

describe('fetchCampaign', () => {
  it('uses the single-campaign endpoint when the server has it', async () => {
    const { api: client, calls } = api(json(200, { campaign: campaign('c1', 2), platforms: {} }))
    const got = await fetchCampaign(client, 'c1')
    expect(got).toMatchObject({ kind: 'found', complete: true, campaign: { id: 'c1' } })
    expect(calls[0]!.url).toBe('http://api.test/api/plugins/figma/campaigns/c1')
  })

  it('reports a deleted campaign', async () => {
    const { api: client } = api(json(404, { code: 'campaign_not_found', error: 'not found' }))
    expect(await fetchCampaign(client, 'c1')).toEqual({ kind: 'gone' })
  })

  it('falls back to the campaign list until the endpoint exists', async () => {
    const { api: client } = api(json(404, null), json(200, { campaigns: [campaign('c1', 300), campaign('c2')] }))
    // 300 posts is the list's cap: deletions can't be told.
    expect(await fetchCampaign(client, 'c1')).toMatchObject({ kind: 'found', complete: false })
    const { api: again } = api(json(404, null), json(200, { campaigns: [campaign('c2')] }))
    expect(await fetchCampaign(again, 'c1')).toEqual({ kind: 'unknown' })
  })
})
