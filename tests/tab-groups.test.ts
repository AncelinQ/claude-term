import { describe, it, expect } from 'vitest'
import {
  NO_GROUPS, GROUP_COLORS, gather, barItems, hiddenTabs, nextColor, createGroup, addToGroup, enterGroup, removeFromGroup, ungroup, updateGroup,
  dropTab, dropGroup, groupByKind, placeOpened, prune, unfoldFor, stepTab, type TabGroup, type TabGroups,
} from '../src/shared/tab-groups'

const grp = (id: string, o: Partial<TabGroup> = {}): TabGroup => ({ id, name: id.toUpperCase(), color: 'blue', folded: false, ...o })
const order = ['a', 'b', 'c', 'd', 'e']
/** a and c in G, e in H */
const base = (): TabGroups => ({ groups: [grp('G'), grp('H', { color: 'green' })], members: { a: 'G', c: 'G', e: 'H' } })

describe('tab groups', () => {
  it('gathers a group at the place of its first tab and lays the bar out', () => {
    expect(gather(order, base().members)).toEqual(['a', 'c', 'b', 'd', 'e'])
    expect(barItems(order, base())).toEqual([{ group: base().groups[0], tabs: ['a', 'c'] }, { tab: 'b' }, { tab: 'd' }, { group: base().groups[1], tabs: ['e'] }])
    // a member whose group is gone shows as a tab alone
    expect(barItems(['x'], { groups: [], members: { x: 'gone' } })).toEqual([{ tab: 'x' }])
    expect(barItems([], NO_GROUPS)).toEqual([])
  })

  it('folds: hidden tabs, and the next tab skips them except the one shown', () => {
    const g = updateGroup(base(), 'G', { folded: true })
    expect([...hiddenTabs(order, g)]).toEqual(['a', 'c'])
    expect(stepTab(order, g, 'b', 1)).toBe('d')
    expect(stepTab(order, g, 'b', -1)).toBe('e')   // wraps, a and c hidden
    expect(stepTab(order, g, 'a', 1)).toBe('b')    // the shown tab of a folded group still steps
    expect(stepTab(order, g, null, 1)).toBe('b')
    expect(stepTab(order, g, null, -1)).toBe('e')
    expect(stepTab([], NO_GROUPS, null, 1)).toBeNull()
    expect(unfoldFor(g, 'c').groups[0].folded).toBe(false)
    expect(unfoldFor(g, 'b')).toBe(g)
    expect(unfoldFor(base(), 'a')).toEqual(base())
  })

  it('picks a colour no group uses, the first again when all are', () => {
    expect(nextColor(base())).toBe('purple')
    expect(nextColor({ groups: GROUP_COLORS.map((c, i) => grp('x' + i, { color: c })), members: {} })).toBe(GROUP_COLORS[0])
  })

  it('creates a group from tabs (leaving theirs), at the first one', () => {
    const r = createGroup(base(), order, ['d', 'e'], grp('N'))
    expect(r.order).toEqual(['a', 'c', 'b', 'd', 'e'])
    expect(r.groups.members).toEqual({ a: 'G', c: 'G', d: 'N', e: 'N' })
    expect(r.groups.groups.map((x) => x.id)).toEqual(['G', 'N'])   // H lost its only tab
    const r2 = createGroup(NO_GROUPS, order, ['d', 'b'], grp('N'))
    expect(r2.order).toEqual(['a', 'b', 'd', 'c', 'e'])
  })

  it('adds a tab at the end of a group, enters it at the head, takes one out right after it', () => {
    expect(addToGroup(base(), order, 'd', 'G')).toMatchObject({ order: ['a', 'c', 'd', 'b', 'e'], groups: { members: { a: 'G', c: 'G', d: 'G', e: 'H' } } })
    expect(enterGroup(base(), order, 'd', 'G').order).toEqual(['d', 'a', 'c', 'b', 'e'])
    // from another group: that one goes when empty
    expect(addToGroup(base(), order, 'e', 'G').groups.groups.map((x) => x.id)).toEqual(['G'])
    expect(addToGroup(base(), order, 'd', 'nope')).toEqual({ groups: base(), order })
    // its only tab already: it stays where it is; a group without open tabs takes it at the end
    expect(addToGroup(base(), order, 'e', 'H')).toEqual({ groups: base(), order })
    expect(enterGroup(base(), order, 'e', 'H')).toEqual({ groups: base(), order })
    expect(addToGroup({ groups: [grp('E')], members: {} }, ['a', 'b'], 'a', 'E')).toMatchObject({ order: ['b', 'a'], groups: { members: { a: 'E' } } })
    const out = removeFromGroup(base(), order, 'a')
    expect(out.order).toEqual(['c', 'a', 'b', 'd', 'e'])
    expect(out.groups.members).toEqual({ c: 'G', e: 'H' })
    expect(removeFromGroup(base(), order, 'e').groups.groups.map((x) => x.id)).toEqual(['G'])
    expect(removeFromGroup(base(), order, 'b')).toEqual({ groups: base(), order })
  })

  it('ungroups, renames, recolours', () => {
    expect(ungroup(base(), 'G')).toEqual({ groups: [grp('H', { color: 'green' })], members: { e: 'H' } })
    expect(updateGroup(base(), 'H', { name: 'Serveurs', color: 'red' }).groups[1]).toMatchObject({ name: 'Serveurs', color: 'red' })
  })

  it("drops a tab on a tab: before or after, taking the target's group or none", () => {
    expect(dropTab(base(), order, 'd', 'a', 'before')).toMatchObject({ order: ['d', 'a', 'c', 'b', 'e'], groups: { members: { d: 'G' } } })
    expect(dropTab(base(), order, 'a', 'b', 'after')).toMatchObject({ order: ['c', 'b', 'a', 'd', 'e'], groups: { members: { c: 'G', e: 'H' } } })
    expect(dropTab(base(), order, 'e', 'b', 'before').groups.groups.map((x) => x.id)).toEqual(['G'])
    expect(dropTab(base(), order, 'a', 'a', 'after')).toEqual({ groups: base(), order })
    expect(dropTab(base(), order, 'a', 'zz', 'after')).toEqual({ groups: base(), order })
  })

  it('drops a group before or after a tab, or around the whole group of that tab', () => {
    expect(dropGroup(base(), order, 'H', 'b', 'before').order).toEqual(['a', 'c', 'e', 'b', 'd'])
    expect(dropGroup(base(), order, 'G', 'e', 'after').order).toEqual(['b', 'd', 'e', 'a', 'c'])
    const two = { groups: [grp('G'), grp('H')], members: { a: 'G', b: 'H', d: 'H' } }
    expect(dropGroup(two, order, 'G', 'd', 'after').order).toEqual(['b', 'd', 'a', 'c', 'e'])
    expect(dropGroup(two, order, 'G', 'b', 'before').order).toEqual(['a', 'b', 'd', 'c', 'e'])
    expect(dropGroup(base(), order, 'G', 'c', 'after')).toEqual({ groups: base(), order })   // onto itself
    expect(dropGroup(base(), order, 'nope', 'b', 'after')).toEqual({ groups: base(), order })
  })

  it('groups the Claude tabs or the shells: those in no group join the group of that kind, or a new one', () => {
    const tabs = [{ id: 'a', kind: 'claude' }, { id: 'b', kind: 'shell' }, { id: 'c', kind: 'claude' }, { id: 'd', kind: 'claude' }, { id: 'e', kind: 'file' }]
    const fresh = () => grp('K', { name: 'Claude' })
    const r = groupByKind(NO_GROUPS, order, 'claude', tabs, fresh)
    expect(r.order).toEqual(['a', 'c', 'd', 'b', 'e'])
    expect(r.groups.groups).toEqual([grp('K', { name: 'Claude', kind: 'claude' })])
    // a new Claude tab joins it; one already in a group stays there
    const r2 = groupByKind({ ...r.groups, members: { ...r.groups.members, d: 'Z' }, groups: [...r.groups.groups, grp('Z')] }, [...r.order, 'f'], 'claude', [...tabs.filter((t) => t.id !== 'd'), { id: 'f', kind: 'claude' }], fresh)
    expect(r2.groups.members.f).toBe('K')
    expect(r2.groups.members.d).toBe('Z')
    expect(groupByKind(r.groups, r.order, 'claude', tabs, fresh)).toEqual(r)   // nothing left out
    expect(groupByKind(NO_GROUPS, order, 'shell', [], fresh)).toEqual({ groups: NO_GROUPS, order })
  })

  it('places a tab just opened beside the group of its kind, or into it unfolded; at the end without one', () => {
    const g: TabGroups = { groups: [grp('K', { kind: 'claude', folded: true })], members: { a: 'K', b: 'K' } }
    const o = ['a', 'b', 'c', 'n']
    expect(placeOpened(g, o, 'n', 'claude', 'beside')).toEqual({ groups: g, order: ['a', 'b', 'n', 'c'] })
    const joined = placeOpened(g, o, 'n', 'claude', 'join')
    expect(joined.order).toEqual(['a', 'b', 'n', 'c'])
    expect(joined.groups).toMatchObject({ members: { n: 'K' }, groups: [{ folded: false }] })
    expect(placeOpened(g, o, 'n', 'shell', 'beside')).toEqual({ groups: g, order: o })
  })

  it('forgets closed tabs and the groups they leave empty', () => {
    expect(prune(base(), ['a', 'b'])).toEqual({ groups: [grp('G')], members: { a: 'G' } })
    expect(prune(base(), order)).toEqual(base())
  })
})
