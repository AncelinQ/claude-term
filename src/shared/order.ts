/** Moves the item `from` before or after the item `to` (drag and drop of tabs). Unknown keys: the list unchanged. */
export function reorder<T>(items: T[], key: (x: T) => string, from: string, to: string, place: 'before' | 'after'): T[] {
  const moving = items.find((x) => key(x) === from)
  if (!moving || from === to || !items.some((x) => key(x) === to)) return items
  const rest = items.filter((x) => key(x) !== from)
  const at = rest.findIndex((x) => key(x) === to) + (place === 'after' ? 1 : 0)
  return [...rest.slice(0, at), moving, ...rest.slice(at)]
}
