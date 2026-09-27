import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/** Layout metrics remembered per viewer (localStorage), not in settings.json. */
export function useStoredSize(key: string, initial: number): [number, (v: number) => void] {
  const [v, setV] = useState(() => { try { const s = localStorage.getItem('layout:' + key); return s ? +s : initial } catch { return initial } })
  const set = useCallback((n: number) => { setV(n); try { localStorage.setItem('layout:' + key, String(n)) } catch {} }, [key])
  return [v, set]
}

/** Drag handle. `axis` x resizes a width, y a height; `sign` −1 when the resized box is after the handle. */
export function Gutter({ axis, onDrag, onEnd, className, inert }: { axis: 'x' | 'y'; onDrag: (delta: number) => void; onEnd?: () => void; className?: string; inert?: boolean }) {
  const start = useRef(0)
  const onDown = (e: React.MouseEvent) => {
    e.preventDefault()
    start.current = axis === 'x' ? e.clientX : e.clientY
    document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize'
    const move = (ev: MouseEvent) => {
      const cur = axis === 'x' ? ev.clientX : ev.clientY
      onDrag(cur - start.current)
      start.current = cur
    }
    const up = () => { document.body.style.cursor = ''; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); onEnd?.() }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  return <div className={'gutter ' + axis + (className ? ' ' + className : '') + (inert ? ' inert' : '')} onMouseDown={onDown} />
}

/**
 * Two stacked islands with a draggable divider; the bottom one has a remembered height and
 * can be collapsed (then the divider is inert).
 */
export function VStack({ id, top, bottom, collapsed, min = 100, initial = 220 }: {
  id: string; top: ReactNode; bottom: ReactNode; collapsed: boolean; min?: number; initial?: number
}) {
  const [h, setH] = useStoredSize(id, initial)
  const ref = useRef<HTMLDivElement>(null)
  const clamp = (v: number) => Math.max(min, Math.min(v, (ref.current?.clientHeight ?? 1000) - min - 20))
  return (
    <div className="vstack" ref={ref}>
      <div className="vstack-top">{top}</div>
      <Gutter axis="y" inert={collapsed} onDrag={(d) => setH(clamp(h - d))} />
      <div className="vstack-bottom" style={{ height: collapsed ? undefined : h, flex: collapsed ? 'none' : undefined }}>{bottom}</div>
    </div>
  )
}

export function useWindowResize(cb: () => void) {
  useEffect(() => { window.addEventListener('resize', cb); return () => window.removeEventListener('resize', cb) }, [cb])
}
