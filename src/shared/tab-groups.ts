/**
 * Groups of tabs in a project's tab bar, like Chrome's (pure, tested). The bar has one order, the project's tabs; a
 * group's tabs are kept together at the place of its first one (gather). Every gesture takes the gathered order and
 * gives one back, with the groups.
 */

export type GroupColor = 'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan' | 'orange'
export const GROUP_COLORS: GroupColor[] = ['blue', 'green', 'purple', 'orange', 'cyan', 'pink', 'red', 'yellow', 'grey']

export interface TabGroup {
  id: string
  /** empty: a colour dot alone */
  name: string
  color: GroupColor
  folded: boolean
  /** made by "Grouper les onglets Claude / les shells": where new tabs of that kind go */
  kind?: 'claude' | 'shell'
}
export interface TabGroups {
  groups: TabGroup[]
  /** tab id → group id */
  members: Record<string, string>
}
export const NO_GROUPS: TabGroups = { groups: [], members: {} }

type Result = { groups: TabGroups; order: string[] }
export type BarItem = { tab: string } | { group: TabGroup; tabs: string[] }

const without = (members: Record<string, string>, ids: string[]) => { const m = { ...members }; for (const id of ids) delete m[id]; return m }
const membersOf = (order: string[], members: Record<string, string>, groupId: string) => order.filter((id) => members[id] === groupId)
/** groups left without a tab go */
const tidy = (g: TabGroups, order: string[]): TabGroups => {
  const used = new Set(order.map((id) => g.members[id]).filter(Boolean))
  return { groups: g.groups.filter((x) => used.has(x.id)), members: g.members }
}

/** Each group's tabs together, at the place of its first one; the rest keeps its order. */
export function gather(order: string[], members: Record<string, string>): string[] {
  const out: string[] = [], placed = new Set<string>()
  for (const id of order) {
    const gid = members[id]
    if (!gid) { out.push(id); continue }
    if (placed.has(gid)) continue
    placed.add(gid)
    out.push(...membersOf(order, members, gid))
  }
  return out
}

/** The bar: tabs alone, and groups with their tabs. */
export function barItems(order: string[], g: TabGroups): BarItem[] {
  const out: BarItem[] = []
  for (const id of gather(order, g.members)) {
    const group = g.groups.find((x) => x.id === g.members[id])
    if (!group) { out.push({ tab: id }); continue }
    const last = out.at(-1)
    if (last && 'group' in last && last.group.id === group.id) last.tabs.push(id)
    else out.push({ group, tabs: [id] })
  }
  return out
}

/** Tabs a folded group hides. */
export function hiddenTabs(order: string[], g: TabGroups): Set<string> {
  const folded = new Set(g.groups.filter((x) => x.folded).map((x) => x.id))
  return new Set(order.filter((id) => folded.has(g.members[id])))
}

/** A colour no group uses yet (the first one again when all are taken). */
export function nextColor(g: TabGroups): GroupColor {
  return GROUP_COLORS.find((c) => !g.groups.some((x) => x.color === c)) ?? GROUP_COLORS[0]
}

/** A new group of `tabs`, gathered at the place of the first one (leaving the groups they were in). */
export function createGroup(g: TabGroups, order: string[], tabs: string[], group: TabGroup): Result {
  const members = { ...without(g.members, tabs) }
  for (const id of tabs) members[id] = group.id
  const next = { groups: [...g.groups, group], members }
  return { groups: tidy(next, order), order: gather(order, members) }
}

/** Moves `tab` into a group: at its end (add) or its head (enter, a tab dropped on the label). */
function intoGroup(g: TabGroups, order: string[], tab: string, groupId: string, at: 'head' | 'end'): Result {
  if (!g.groups.some((x) => x.id === groupId)) return { groups: g, order }
  const rest = gather(order, g.members).filter((id) => id !== tab)
  const mates = rest.filter((id) => g.members[id] === groupId)
  // its only tab already: nothing moves; a group whose tabs are all closed takes it at the end
  if (!mates.length && g.members[tab] === groupId) return { groups: g, order }
  if (!mates.length) rest.push(tab)
  else rest.splice(at === 'head' ? rest.indexOf(mates[0]) : rest.indexOf(mates.at(-1)!) + 1, 0, tab)
  const members = { ...g.members, [tab]: groupId }
  return { groups: tidy({ groups: g.groups, members }, rest), order: rest }
}
export const addToGroup = (g: TabGroups, order: string[], tab: string, groupId: string) => intoGroup(g, order, tab, groupId, 'end')
export const enterGroup = (g: TabGroups, order: string[], tab: string, groupId: string) => intoGroup(g, order, tab, groupId, 'head')

/** Out of its group, the tab lands right after it. */
export function removeFromGroup(g: TabGroups, order: string[], tab: string): Result {
  const gid = g.members[tab]
  if (!gid) return { groups: g, order }
  const rest = gather(order, g.members).filter((id) => id !== tab)
  const last = membersOf(rest, g.members, gid).at(-1)
  rest.splice(last ? rest.indexOf(last) + 1 : rest.length, 0, tab)
  const members = without(g.members, [tab])
  return { groups: tidy({ groups: g.groups, members }, rest), order: rest }
}

/** The group goes, its tabs stay where they are. */
export function ungroup(g: TabGroups, groupId: string): TabGroups {
  return { groups: g.groups.filter((x) => x.id !== groupId), members: Object.fromEntries(Object.entries(g.members).filter(([, v]) => v !== groupId)) }
}

export function updateGroup(g: TabGroups, groupId: string, patch: Partial<Omit<TabGroup, 'id'>>): TabGroups {
  return { ...g, groups: g.groups.map((x) => (x.id === groupId ? { ...x, ...patch } : x)) }
}

/** A tab dropped on a tab: before or after it, taking its group, or none (Chrome's rule). */
export function dropTab(g: TabGroups, order: string[], tab: string, target: string, place: 'before' | 'after'): Result {
  if (tab === target) return { groups: g, order }
  const rest = gather(order, g.members).filter((id) => id !== tab)
  const i = rest.indexOf(target)
  if (i < 0) return { groups: g, order }
  rest.splice(place === 'before' ? i : i + 1, 0, tab)
  const gid = g.members[target]
  const members = gid ? { ...g.members, [tab]: gid } : without(g.members, [tab])
  return { groups: tidy({ groups: g.groups, members }, rest), order: gather(rest, members) }
}

/** A label dragged: the whole group before or after the target tab, or the target's whole group. */
export function dropGroup(g: TabGroups, order: string[], groupId: string, target: string, place: 'before' | 'after'): Result {
  const gathered = gather(order, g.members)
  const mine = membersOf(gathered, g.members, groupId)
  if (!mine.length || mine.includes(target)) return { groups: g, order }
  const rest = gathered.filter((id) => !mine.includes(id))
  const tgid = g.members[target]
  const span = tgid ? membersOf(rest, g.members, tgid) : [target]
  const at = place === 'before' ? rest.indexOf(span[0]) : rest.indexOf(span.at(-1)!) + 1
  rest.splice(at, 0, ...mine)
  return { groups: g, order: rest }
}

/**
 * "Grouper les onglets Claude / les shells": the tabs of that kind in no group join the group of that kind, or a new
 * one. A tab already in a group stays there.
 */
export function groupByKind(g: TabGroups, order: string[], kind: 'claude' | 'shell', tabs: { id: string; kind: string }[], fresh: () => TabGroup): Result {
  const loose = tabs.filter((t) => t.kind === kind && !g.members[t.id]).map((t) => t.id)
  if (!loose.length) return { groups: g, order }
  const existing = g.groups.find((x) => x.kind === kind && membersOf(order, g.members, x.id).length)
  if (!existing) return createGroup(g, order, loose, { ...fresh(), kind })
  let r: Result = { groups: g, order }
  for (const id of loose) r = addToGroup(r.groups, r.order, id, existing.id)
  return r
}

/**
 * Where a tab just opened goes: when a group of its kind exists, right after it (beside) or into it, unfolded (join);
 * otherwise at the end, where it already is.
 */
export function placeOpened(g: TabGroups, order: string[], tab: string, kind: string, mode: 'beside' | 'join'): Result {
  const group = g.groups.find((x) => x.kind === kind && membersOf(order, g.members, x.id).some((id) => id !== tab))
  if (!group) return { groups: g, order }
  if (mode === 'join') { const r = addToGroup(g, order, tab, group.id); return { groups: updateGroup(r.groups, group.id, { folded: false }), order: r.order } }
  const rest = gather(order, g.members).filter((id) => id !== tab)
  const last = membersOf(rest, g.members, group.id).at(-1)!
  rest.splice(rest.indexOf(last) + 1, 0, tab)
  return { groups: g, order: rest }
}

/** Closed tabs leave their group; a group without tabs goes. */
export function prune(g: TabGroups, order: string[]): TabGroups {
  const alive = new Set(order)
  const members = Object.fromEntries(Object.entries(g.members).filter(([id]) => alive.has(id)))
  return tidy({ groups: g.groups, members }, order)
}

/** Showing a tab unfolds its group. */
export function unfoldFor(g: TabGroups, tab: string): TabGroups {
  const gid = g.members[tab]
  return gid && g.groups.find((x) => x.id === gid)?.folded ? updateGroup(g, gid, { folded: false }) : g
}

/** The next or previous tab to show, skipping those a folded group hides (the current one is never skipped). */
export function stepTab(order: string[], g: TabGroups, current: string | null, step: 1 | -1): string | null {
  const hidden = hiddenTabs(order, g)
  const shown = gather(order, g.members).filter((id) => id === current || !hidden.has(id))
  if (!shown.length) return null
  const i = current ? shown.indexOf(current) : -1
  if (i < 0) return step === 1 ? shown[0] : shown.at(-1)!
  return shown[(i + step + shown.length) % shown.length]
}
