import { getCampaign, listCampaigns, type Campaign } from '../api/campaigns'
import { isApiError, type ApiClient } from '../api/client'

// GET /campaigns caps each campaign's posts (CON-344); a list this long may
// be cut short.
const LIST_POST_CAP = 300

export type CampaignFetch =
  | { kind: 'found'; campaign: Campaign; complete: boolean }
  // Deleted in Ogen, or moved out of this workspace.
  | { kind: 'gone' }
  // Not in the campaign list, so possibly archived: nothing can be told.
  | { kind: 'unknown' }

// fetchCampaign gets one campaign with every post for a board (CON-352).
// Until the server has that endpoint, it falls back to the campaign list,
// whose post list can be cut short and which leaves archived campaigns out.
export async function fetchCampaign(api: ApiClient, id: string, signal?: AbortSignal): Promise<CampaignFetch> {
  try {
    return { kind: 'found', campaign: await getCampaign(api, id, signal), complete: true }
  } catch (err) {
    if (!isApiError(err) || err.status !== 404) throw err
    if (err.code === 'campaign_not_found') return { kind: 'gone' }
  }
  const campaign = (await listCampaigns(api, signal)).find((c) => c.id === id)
  if (!campaign) return { kind: 'unknown' }
  return { kind: 'found', campaign, complete: campaign.posts.length < LIST_POST_CAP }
}
