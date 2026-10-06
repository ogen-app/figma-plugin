// The protocol between the main sandbox (figma.* API, no network) and the UI
// iframe (network, no figma.* API). The UI drives: it calls main through
// request/response RPCs, and main pushes document events to it.

export type ExportFormat = 'PNG' | 'JPG'
export type Scale = 1 | 2 | 3

// Video export of a Figma Motion animation (CON-347).
export type VideoFormat = 'MP4' | 'WEBM'
export type VideoQuality = 'LOW' | 'MEDIUM' | 'HIGH'
// Video renders every frame of the animation; above 2× files get huge.
export type VideoScale = 1 | 2
export const VIDEO_FPS = 30

// Node types the plugin offers to send: top-level containers a designer
// thinks of as "a frame".
export const EXPORTABLE_TYPES = ['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'GROUP', 'SECTION'] as const
export type ExportableType = (typeof EXPORTABLE_TYPES)[number]

export interface SelectionItem {
  id: string
  name: string
  type: ExportableType
  width: number
  height: number
  // Set when the layer or something inside it is animated with Figma Motion.
  animation?: Animation
}

// Figma exports video only from a top-level frame (directly on a page), and
// always the whole frame. frame is that frame: the item itself when it is
// top-level, else the frame it sits in.
export interface Animation {
  // Longest timeline in the frame, in seconds; 0 when Figma reports none.
  durationSec: number
  frame: { id: string; name: string; width: number; height: number }
}

export function isVideoExportable(item: SelectionItem): boolean {
  return item.animation?.frame.id === item.id
}

// clientStorage keys. Main refuses any other key.
export const STORAGE_KEYS = {
  session: 'ogen',
  prefs: 'ogen.prefs',
} as const
export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

export function isStorageKey(key: unknown): key is StorageKey {
  return Object.values(STORAGE_KEYS).includes(key as StorageKey)
}

export interface ExportedImage {
  bytes: Uint8Array
  nodeId: string
  nodeName: string
  fileName: string
}

export interface ExportedVideo {
  bytes: Uint8Array
  nodeId: string
  nodeName: string
  fileName: string
}

export interface RpcMethods {
  exportNode: { params: { nodeId: string; format: ExportFormat; scale: Scale }; result: ExportedImage }
  exportVideo: {
    params: { nodeId: string; format: VideoFormat; quality: VideoQuality; scale: VideoScale }
    result: ExportedVideo
  }
  storageGet: { params: { key: StorageKey }; result: unknown }
  storageSet: { params: { key: StorageKey; value: unknown }; result: null }
  storageDelete: { params: { key: StorageKey }; result: null }
}
export type RpcMethod = keyof RpcMethods

export type UiToMain =
  | { type: 'ready' }
  | { type: 'request-selection' }
  | { type: 'rpc'; id: number; method: RpcMethod; params: unknown }
  | { type: 'notify'; message: string; error?: boolean }
  | { type: 'resize'; height: number }
  // Select a layer on the current page, e.g. an item's animated top-level frame.
  | { type: 'select'; nodeId: string }

export type MainToUi =
  | { type: 'init'; userName: string | null; fileName: string }
  // skipped counts selected layers that are not exportable types.
  | { type: 'selection'; items: SelectionItem[]; skipped: number }
  | { type: 'thumbnail'; id: string; bytes: Uint8Array }
  | { type: 'rpc-result'; id: number; ok: true; value: unknown }
  | { type: 'rpc-result'; id: number; ok: false; error: string }
