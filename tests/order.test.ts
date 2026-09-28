import { describe, it, expect } from 'vitest'
import { reorder } from '../src/shared/order'

const k = (x: string) => x
describe('tab reorder', () => {
  it('moves before / after the target', () => {
    expect(reorder(['a', 'b', 'c', 'd'], k, 'a', 'c', 'after')).toEqual(['b', 'c', 'a', 'd'])
    expect(reorder(['a', 'b', 'c', 'd'], k, 'a', 'c', 'before')).toEqual(['b', 'a', 'c', 'd'])
    expect(reorder(['a', 'b', 'c', 'd'], k, 'd', 'a', 'before')).toEqual(['d', 'a', 'b', 'c'])
    expect(reorder(['a', 'b', 'c', 'd'], k, 'b', 'd', 'after')).toEqual(['a', 'c', 'd', 'b'])
  })
  it('ignores self drops and unknown keys', () => {
    const l = ['a', 'b']
    expect(reorder(l, k, 'a', 'a', 'after')).toBe(l)
    expect(reorder(l, k, 'x', 'a', 'after')).toBe(l)
    expect(reorder(l, k, 'a', 'x', 'after')).toBe(l)
  })
})
