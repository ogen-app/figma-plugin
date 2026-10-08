import { useEffect, useRef, useState } from 'preact/hooks'
import { Logo } from './Logo'

export type Tab = 'send' | 'boards'

export interface HeaderProps {
  workspaceName: string
  userName?: string
  tab: Tab
  onTab: (tab: Tab) => void
  onDisconnect: () => void
}

const TABS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: 'send', label: 'Send' },
  { value: 'boards', label: 'Boards' },
]

export function Header({ workspaceName, userName, tab, onTab, onDisconnect }: HeaderProps) {
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
        <Logo size={24} />
        <div class="segmented tabs" role="tablist" aria-label="Plugin sections">
          {TABS.map((t) => (
            <button key={t.value} role="tab" aria-selected={t.value === tab} class={t.value === tab ? 'selected' : ''} onClick={() => onTab(t.value)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div class="menu" ref={ref}>
        <button class="icon" aria-label="Connection menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
          ⋯
        </button>
        {open && (
          <div class="menu-popover" role="menu">
            <div class="menu-caption" title={workspaceName}>
              <span class="muted">Workspace</span> <strong>{workspaceName || 'Ogen'}</strong>
            </div>
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
