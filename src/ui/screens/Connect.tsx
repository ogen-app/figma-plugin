import type { ApiClient } from '../../api/client'
import type { DocInfo } from '../app'
import type { StoredSession } from '../storage'

export interface ConnectScreenProps {
  notice?: string
  doc: DocInfo
  api: ApiClient
  onConnected: (session: StoredSession) => Promise<void>
}

export function ConnectScreen({ notice }: ConnectScreenProps) {
  return (
    <main class="screen center">
      <h1>Send frames to Ogen</h1>
      {notice && <p class="notice">{notice}</p>}
      <button class="primary" disabled>
        Connect to Ogen
      </button>
    </main>
  )
}
