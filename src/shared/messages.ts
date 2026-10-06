// The protocol between the main sandbox (figma.* API, no network) and the UI
// iframe (network, no figma.* API). The UI drives: it calls main through
// request/response RPCs, and main pushes document events to it.

export type ExportFormat = 'PNG' | 'JPG'
export type Scale = 1 | 2 | 3

// clientStorage keys. Main refuses any other key.
export const STORAGE_KEYS = {
  session: 'ogen',
  prefs: 'ogen.prefs',
} as const
export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

export function isStorageKey(key: unknown): key is StorageKey {
  return Object.values(STORAGE_KEYS).includes(key as StorageKey)
}

export interface RpcMethods {
  storageGet: { params: { key: StorageKey }; result: unknown }
  storageSet: { params: { key: StorageKey; value: unknown }; result: null }
  storageDelete: { params: { key: StorageKey }; result: null }
}
export type RpcMethod = keyof RpcMethods

export type UiToMain =
  | { type: 'ready' }
  | { type: 'rpc'; id: number; method: RpcMethod; params: unknown }
  | { type: 'notify'; message: string; error?: boolean }

export type MainToUi =
  | { type: 'init'; userName: string | null; fileName: string }
  | { type: 'rpc-result'; id: number; ok: true; value: unknown }
  | { type: 'rpc-result'; id: number; ok: false; error: string }
