import type { ApiClient } from './client'
import { rec, str } from './types'
import type { ExportFormat } from '../shared/messages'

export interface ImageUpload {
  bytes: Uint8Array
  format: ExportFormat
  nodeId: string
  nodeName: string
  fileName: string
  postId?: string
}

export interface AttachError {
  code: string
  message: string
}

export interface ImageResult {
  asset: { id: string; title: string; status: string; url: string }
  deduplicated: boolean
  attachment: { id: string; post_id: string } | null
  attach_error: AttachError | null
  open_url: string
}

// Server-side limits on the form fields (CON-338 §7.1).
const MAX_NODE_NAME = 200
const MAX_FILE_NAME = 200

const MIME: Record<ExportFormat, string> = { PNG: 'image/png', JPG: 'image/jpeg' }

// sendImage uploads one exported frame to the content bank, attaching it to
// postId when given.
export async function sendImage(api: ApiClient, input: ImageUpload, signal?: AbortSignal): Promise<ImageResult> {
  const nodeName = clip(input.nodeName.trim(), MAX_NODE_NAME) || `Frame ${input.nodeId}`
  const ext = input.format === 'JPG' ? 'jpg' : 'png'
  const form = new FormData()
  // The server sniffs the type from the bytes and names the asset after
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

export function toImageResult(v: unknown): ImageResult {
  const o = rec(v)
  const asset = rec(o.asset)
  const att = rec(o.attachment)
  const attErr = rec(o.attach_error)
  return {
    asset: { id: str(asset.id), title: str(asset.title), status: str(asset.status), url: str(asset.url) },
    deduplicated: o.deduplicated === true,
    attachment: att.id ? { id: str(att.id), post_id: str(att.post_id) } : null,
    attach_error: attErr.code ? { code: str(attErr.code), message: str(attErr.message) } : null,
    open_url: str(o.open_url),
  }
}

function clip(s: string, max: number) {
  const chars = Array.from(s)
  return chars.length > max ? chars.slice(0, max).join('') : s
}
