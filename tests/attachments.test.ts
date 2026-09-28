import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { TempDir } from './helpers'
import { Attachments } from '../src/main/services/attachments'

const PNG = 'data:image/png;base64,' + Buffer.from('png-bytes').toString('base64')

describe('attachments', () => {
  it('gives each attachment of the same second its own file', () => {
    const t = new TempDir()
    const a = new Attachments(t.path)
    const now = new Date(2026, 8, 28, 10, 5, 7)
    const paths = [a.newPath('png', now), a.newPath('png', now), a.newPath('jpg', now), a.newPath('png', now)]
    expect(paths.map((p) => basename(p))).toEqual(['20260928-100507.png', '20260928-100507-2.png', '20260928-100507.jpg', '20260928-100507-3.png'])
    // a burst of drops: every image kept
    const saved = [a.saveDataUrl(PNG), a.saveDataUrl(PNG), a.saveDataUrl(PNG)]
    expect(new Set(saved).size).toBe(3)
    for (const p of saved) expect(readFileSync(p!, 'utf8')).toBe('png-bytes')
    expect(a.saveDataUrl('data:text/plain;base64,eA==')).toBeNull()
    t.dispose()
  })
})
