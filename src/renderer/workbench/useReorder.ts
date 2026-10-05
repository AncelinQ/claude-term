import { useState, type DragEvent } from 'react'

type Place = 'before' | 'after' | 'in'

/**
 * Drag and drop reordering of a row of tabs. `kind` keeps rows apart (a project tab cannot land among the center
 * tabs); the drop side follows the pointer (left / right half of the target). Spread `props(id)` on each tab. `holds`:
 * targets that take what is dropped on them ('in': a tab group's label), outlined instead of a line on one side.
 */
export function useReorder(kind: string, onMove: (from: string, to: string, place: Place) => void, o: { holds?: (id: string) => boolean } = {}) {
  const type = 'application/x-claudeterm-' + kind
  const [over, setOver] = useState<{ id: string; place: Place } | null>(null)
  const side = (e: DragEvent<HTMLElement>, id: string): Place => {
    if (o.holds?.(id)) return 'in'
    const r = e.currentTarget.getBoundingClientRect()
    return e.clientX < r.left + r.width / 2 ? 'before' : 'after'
  }
  const props = (id: string) => ({
    draggable: true,
    onDragStart: (e: DragEvent<HTMLElement>) => { e.stopPropagation(); e.dataTransfer.setData(type, id); e.dataTransfer.effectAllowed = 'move' },
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!e.dataTransfer.types.includes(type)) return
      e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'
      const place = side(e, id)
      if (over?.id !== id || over.place !== place) setOver({ id, place })
    },
    onDragLeave: (e: DragEvent<HTMLElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((v) => (v?.id === id ? null : v)) },
    onDrop: (e: DragEvent<HTMLElement>) => {
      const from = e.dataTransfer.getData(type)
      setOver(null)
      if (!from) return
      e.preventDefault(); e.stopPropagation()
      onMove(from, id, side(e, id))
    },
    onDragEnd: () => setOver(null),
  })
  const dropClass = (id: string) => (over?.id === id ? ' drop-' + over.place : '')
  return { props, dropClass }
}
