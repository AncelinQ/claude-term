import { describe, it, expect } from 'vitest'
// @ts-expect-error plain ES module script
import { nextVersion } from '../scripts/next-version.mjs'

describe('release version', () => {
  it('bumps the patch of the latest tag, or takes a higher package.json version', () => {
    expect(nextVersion([], '2.0.0')).toBe('2.0.0')
    expect(nextVersion(['v2.0.0'], '2.0.0')).toBe('2.0.1')
    expect(nextVersion(['v2.0.0', 'v2.0.10', 'v2.0.9', 'v1-swift', 'junk'], '2.0.0')).toBe('2.0.11')
    expect(nextVersion(['v2.0.4'], '2.1.0')).toBe('2.1.0')
    expect(nextVersion(['v2.1.0'], '2.1.0')).toBe('2.1.1')
    expect(nextVersion(['v3.0.0'], '2.1.0')).toBe('3.0.1')
    expect(() => nextVersion([], 'x')).toThrow(/invalide/)
  })
})
