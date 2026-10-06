import type { ApiClient } from './client'
import { clip, num, rec, str } from './types'
import type { VideoFormat } from '../shared/messages'

// Video sends to a post (CON-347): presign a storage upload, PUT the bytes
// there, then finalize so Ogen probes the video and attaches it. The bytes
// never pass through the API process.

export interface VideoUpload {
  bytes: Uint8Array
  format: VideoFormat
  nodeId: string
  nodeName: string
  fileName: string
  postId: string
}

// PlatformIssue is one way the video breaks the post platform's rules. The
// attachment is created anyway; the post can't publish until it's fixed.
export interface PlatformIssue {
  rule: string
  message: string
}

export interface VideoResult {
  kind: 'video'
  attachment: { id: string; post_id: string; duration_ms: number; width: number; height: number }
  platform_validation: PlatformIssue[]
  open_url: string
}

export const VIDEO_MIME: Record<VideoFormat, string> = { MP4: 'video/mp4', WEBM: 'video/webm' }

// Same server-side limits as image sends (CON-338 §7.1).
const MAX_NODE_NAME = 200
const MAX_FILE_NAME = 200

export async function sendVideo(api: ApiClient, input: VideoUpload, signal?: AbortSignal): Promise<VideoResult> {
  const base = `/posts/${encodeURIComponent(input.postId)}/videos`
  const contentType = VIDEO_MIME[input.format]
  const { data: presigned } = await api.request('POST', `${base}/presign`, {
    body: { content_type: contentType, size_bytes: input.bytes.byteLength },
    signal,
  })
  const p = rec(presigned)
  const uploadUrl = str(p.upload_url)
  const key = str(p.s3_key)
  if (!uploadUrl || !key) throw new Error('Ogen did not return an upload URL.')

  await api.putObject(uploadUrl, new Blob([input.bytes as Uint8Array<ArrayBuffer>], { type: contentType }), signal)

  const body: Record<string, string> = {
    s3_key: key,
    node_id: input.nodeId,
    node_name: clip(input.nodeName.trim(), MAX_NODE_NAME) || `Frame ${input.nodeId}`,
  }
  const fileName = clip(input.fileName.trim(), MAX_FILE_NAME)
  if (fileName) body.file_name = fileName
  const { data } = await api.request('POST', `${base}/finalize`, { body, signal })
  return toVideoResult(data)
}

export function toVideoResult(v: unknown): VideoResult {
  const o = rec(v)
  const att = rec(o.attachment)
  const issues = Array.isArray(o.platform_validation) ? o.platform_validation : []
  return {
    kind: 'video',
    attachment: {
      id: str(att.id),
      post_id: str(att.post_id),
      duration_ms: num(att.duration_ms, 0),
      width: num(att.width, 0),
      height: num(att.height, 0),
    },
    platform_validation: issues
      .map((i) => rec(i))
      .map((i) => ({ rule: str(i.rule), message: str(i.message) }))
      .filter((i) => i.message !== ''),
    open_url: str(o.open_url),
  }
}
