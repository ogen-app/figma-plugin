import { rec, str, toUser, toWorkspace, type User, type Workspace } from '../api/types'
import { STORAGE_KEYS, type ExportFormat, type Scale } from '../shared/messages'
import type { Bridge } from './bridge'

// StoredSession is what pairing yields, kept in clientStorage under "ogen".
export interface StoredSession {
  token: string
  workspace: Workspace
  user: User
}

export interface Prefs {
  format: ExportFormat
  scale: Scale
}

export const DEFAULT_PREFS: Prefs = { format: 'PNG', scale: 2 }

export function parseSession(v: unknown): StoredSession | null {
  const o = rec(v)
  const token = str(o.token)
  if (!token.startsWith('ogp_')) return null
  return { token, workspace: toWorkspace(o.workspace), user: toUser(o.user) }
}

export function parsePrefs(v: unknown): Prefs {
  const o = rec(v)
  return {
    format: o.format === 'JPG' ? 'JPG' : o.format === 'PNG' ? 'PNG' : DEFAULT_PREFS.format,
    scale: o.scale === 1 || o.scale === 2 || o.scale === 3 ? o.scale : DEFAULT_PREFS.scale,
  }
}

export type Store = ReturnType<typeof createStore>

// createStore reads and writes the plugin's clientStorage through main.
export function createStore(bridge: Bridge) {
  return {
    async loadSession(): Promise<StoredSession | null> {
      return parseSession(await bridge.call('storageGet', { key: STORAGE_KEYS.session }))
    },
    async saveSession(session: StoredSession): Promise<void> {
      await bridge.call('storageSet', { key: STORAGE_KEYS.session, value: session })
    },
    async clearSession(): Promise<void> {
      await bridge.call('storageDelete', { key: STORAGE_KEYS.session })
    },
    async loadPrefs(): Promise<Prefs> {
      return parsePrefs(await bridge.call('storageGet', { key: STORAGE_KEYS.prefs }))
    },
    async savePrefs(prefs: Prefs): Promise<void> {
      await bridge.call('storageSet', { key: STORAGE_KEYS.prefs, value: prefs })
    },
  }
}
