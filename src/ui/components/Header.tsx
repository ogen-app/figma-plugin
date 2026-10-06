import { useEffect, useRef, useState } from 'preact/hooks'
import { Logo } from './Logo'

export interface HeaderProps {
  workspaceName: string
  userName?: string
  onDisconnect: () => void
}

export function Header({ workspaceName, userName, onDisconnect }: HeaderProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <header class="header">
      <div class="brand">
        <Logo size={28} />
        <div class="header-title">
          <span class="muted">Sending to</span>
          <strong title={workspaceName}>{workspaceName || 'your workspace'}</strong>
        </div>
      </div>
      <div class="menu" ref={ref}>
        <button class="icon" aria-label="Connection menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
          ⋯
        </button>
        {open && (
          <div class="menu-popover" role="menu">
            {userName && <div class="menu-caption muted">Connected as {userName}</div>}
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onDisconnect()
              }}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
