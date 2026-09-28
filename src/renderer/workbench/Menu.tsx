import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export interface MenuItem { label: string; icon?: ReactNode; shortcut?: string; onSelect: () => void; danger?: boolean; disabled?: boolean }

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

/** Context menu at a screen position (right click). Render it when `at` is set. */
export function ContextMenu({ at, items, onClose }: { at: { x: number; y: number } | null; items: (MenuItem | 'sep')[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!at) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('mousedown', onDown); window.addEventListener('keydown', onKey); window.addEventListener('blur', onClose)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); window.removeEventListener('blur', onClose) }
  }, [at, onClose])
  // kept inside the window, measured once rendered
  useLayoutEffect(() => {
    const m = ref.current
    if (!at || !m) return
    const r = m.getBoundingClientRect()
    m.style.left = Math.max(4, Math.min(at.x, window.innerWidth - r.width - 4)) + 'px'
    m.style.top = Math.max(4, Math.min(at.y, window.innerHeight - r.height - 4)) + 'px'
  }, [at])
  if (!at) return null
  const x = at.x, y = at.y
  return (
    <div className="menu ctx" ref={ref} style={{ left: x, top: y }}>
      {items.map((it, i) => it === 'sep' ? <div key={i} className="menu-sep" /> : (
        <button key={i} className={'menu-item' + (it.danger ? ' danger' : '')} disabled={it.disabled} onClick={() => { onClose(); it.onSelect() }}>
          <span className="mi-icon">{it.icon}</span><span className="mi-label">{it.label}</span>{it.shortcut && <span className="mi-key">{it.shortcut}</span>}
        </button>
      ))}
    </div>
  )
}
