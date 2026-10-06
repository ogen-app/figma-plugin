import type { Me } from '../../api/types'
import type { StoredSession } from '../storage'

export interface SendScreenProps {
  session: StoredSession
  me: Me | null
}

export function SendScreen({ session, me }: SendScreenProps) {
  return (
    <main class="screen">
      <h1>{me?.workspace.name || session.workspace.name}</h1>
    </main>
  )
}
