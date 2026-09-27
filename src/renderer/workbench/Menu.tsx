import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface MenuItem { label: string; icon?: ReactNode; shortcut?: string; onSelect: () => void; danger?: boolean }

/** A themed dropdown under its trigger button; closes on outside click or Escape. */
export function MenuButton({ items, title, children, className, align = 'right' }: { items: (MenuItem | 'sep')[]; title?: string; children: ReactNode; className?: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onDown); window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <span className="menu-anchor" ref={ref}>
      <button className={className + (open ? ' on' : '')} title={title} onClick={() => setOpen(!open)}>{children}</button>
      {open && (
        <div className={'menu ' + align}>
          {items.map((it, i) => it === 'sep' ? <div key={i} className="menu-sep" /> : (
            <button key={i} className={'menu-item' + (it.danger ? ' danger' : '')} onClick={() => { setOpen(false); it.onSelect() }}>
              <span className="mi-icon">{it.icon}</span><span className="mi-label">{it.label}</span>{it.shortcut && <span className="mi-key">{it.shortcut}</span>}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}
