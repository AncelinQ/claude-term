import { describe, it, expect } from 'vitest'
import { parseFeed, pickMacZip } from '../src/shared/update'

const yml = `version: 2.0.1
files:
  - url: ClaudeTerm-2.0.1-arm64-mac.zip
    sha512: AAA==
    size: 101
  - url: ClaudeTerm-2.0.1-mac.zip
    sha512: 'BBB=='
    size: 102
  - url: ClaudeTerm-2.0.1-arm64.dmg
    sha512: CCC==
    size: 103
path: ClaudeTerm-2.0.1-arm64-mac.zip
sha512: AAA==
releaseDate: '2026-09-27T14:00:00.000Z'
`

describe('update feed', () => {
  it('parses version and files', () => {
    const f = parseFeed(yml)
    expect(f.version).toBe('2.0.1')
    expect(f.files).toEqual([
      { url: 'ClaudeTerm-2.0.1-arm64-mac.zip', sha512: 'AAA==', size: 101 },
      { url: 'ClaudeTerm-2.0.1-mac.zip', sha512: 'BBB==', size: 102 },
      { url: 'ClaudeTerm-2.0.1-arm64.dmg', sha512: 'CCC==', size: 103 },
    ])
    expect(parseFeed('# c\nversion: "3.0.0"\n\nfiles:\n  - url: a.zip\n    sha512: x\n  - sha512: orphan\nother: 1\n  - url: ignored.zip\n').files).toEqual([{ url: 'a.zip', sha512: 'x' }])
    expect(() => parseFeed('version: 1.0.0\n')).toThrow(/invalide/)
    expect(() => parseFeed('files:\n  - url: a.zip\n    sha512: x\n')).toThrow(/invalide/)
    expect(() => parseFeed('version: 1.0.0\nfiles:\n    sha512: x\n')).toThrow(/invalide/)
  })

  it('picks the zip for the architecture', () => {
    const f = parseFeed(yml)
    expect(pickMacZip(f, 'arm64')?.url).toBe('ClaudeTerm-2.0.1-arm64-mac.zip')
    expect(pickMacZip(f, 'x64')?.url).toBe('ClaudeTerm-2.0.1-mac.zip')
    const uni = { version: '1', files: [{ url: 'ClaudeTerm-1-universal-mac.zip', sha512: 'x' }] }
    expect(pickMacZip(uni, 'arm64')?.url).toBe('ClaudeTerm-1-universal-mac.zip')
    expect(pickMacZip({ version: '1', files: [{ url: 'a.dmg', sha512: 'x' }] }, 'x64')).toBeNull()
  })
})
