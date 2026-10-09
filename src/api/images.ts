import type { ApiClient } from './client'
import { clip, rec, str } from './types'
import type { ExportFormat } from '../shared/messages'

export interface ImageUpload {
  bytes: Uint8Array
  format: ExportFormat
  nodeId: string
  nodeName: string
  fileName: string
  postId?: string
}

// ImageResult carries asset for a frame sent to the content bank and
// attachment for one sent to a post; exactly one of the two is set.
export interface ImageResult {
  asset: { id: string; title: string; status: string; url: string } | null
  deduplicated: boolean
  attachment: { id: string; post_id: string } | null
  open_url: string
}

// Server-side limits on the form fields (CON-338 §7.1).
const MAX_NODE_NAME = 200
const MAX_FILE_NAME = 200

const MIME: Record<ExportFormat, string> = { PNG: 'image/png', JPG: 'image/jpeg' }

// sendImage uploads one exported frame: onto postId when given, which keeps it
// out of the content bank, otherwise into the content bank. A post that is
// gone or already sent for publishing is a post_not_found / post_locked reject.
export async function sendImage(api: ApiClient, input: ImageUpload, signal?: AbortSignal): Promise<ImageResult> {
  const nodeName = clip(input.nodeName.trim(), MAX_NODE_NAME) || `Frame ${input.nodeId}`
  const ext = input.format === 'JPG' ? 'jpg' : 'png'
  const form = new FormData()
  // The server sniffs the type from the bytes and names the image after
  // node_name; the filename here only helps its SVG check.
  form.append('file', new Blob([input.bytes as Uint8Array<ArrayBuffer>], { type: MIME[input.format] }), `frame.${ext}`)
  form.append('node_id', input.nodeId)
  form.append('node_name', nodeName)
  const fileName = clip(input.fileName.trim(), MAX_FILE_NAME)
  if (fileName) form.append('file_name', fileName)
  if (input.postId) form.append('post_id', input.postId)
  const { data } = await api.request('POST', '/images', { body: form, signal })
  return toImageResult(data)
}

// toImageResult throws on a response with neither an asset nor an attachment:
// nothing confirms the frame landed, so it must not count as sent.
export function toImageResult(v: unknown): ImageResult {
  const o = rec(v)
  const asset = rec(o.asset)
  const att = rec(o.attachment)
  const result: ImageResult = {
    asset: asset.id
      ? { id: str(asset.id), title: str(asset.title), status: str(asset.status), url: str(asset.url) }
      : null,
    deduplicated: o.deduplicated === true,
    attachment: att.id ? { id: str(att.id), post_id: str(att.post_id) } : null,
    open_url: str(o.open_url),
  }
  if (!result.asset && !result.attachment) throw new Error('Ogen sent an unexpected response. Check Ogen before sending again.')
  return result
}
