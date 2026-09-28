import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { TempDir } from './helpers'
import { FileOps, freeName } from '../src/main/services/file-ops'

describe('file operations', () => {
  it('names copies like the Finder', () => {
    const taken = new Set(['/d/a.ts', '/d/a copie.ts', '/d/.env', '/d/dir'])
    const ex = (p: string) => taken.has(p)
    expect(freeName('/d', 'b.ts', ex)).toBe('b.ts')
    expect(freeName('/d', 'a.ts', ex)).toBe('a copie 2.ts')
    expect(freeName('/d', '.env', ex)).toBe('.env copie')
    expect(freeName('/d', 'dir', ex)).toBe('dir copie')
  })

  it('creates files and folders, never over an existing one', () => {
    const t = new TempDir()
    expect(FileOps.create(t.path, 'a.ts', false)).toEqual({ ok: true, path: join(t.path, 'a.ts') })
    expect(FileOps.create(t.path, 'src', true)).toEqual({ ok: true, path: join(t.path, 'src') })
    expect(FileOps.create(t.path, 'a.ts', false)).toMatchObject({ ok: false, error: expect.stringMatching(/existe déjà/) })
    expect(FileOps.create(t.path, '../evil', false)).toMatchObject({ ok: false, error: 'nom invalide' })
    expect(FileOps.create(t.path, '', true)).toMatchObject({ ok: false })
    t.dispose()
  })

  it('renames, refusing a taken name but allowing a change of case', () => {
    const t = new TempDir()
    t.write('a.ts', 'A'); t.write('b.ts', 'B')
    expect(FileOps.rename(join(t.path, 'a.ts'), 'b.ts')).toMatchObject({ ok: false })
    expect(readFileSync(join(t.path, 'b.ts'), 'utf8')).toBe('B')
    expect(FileOps.rename(join(t.path, 'a.ts'), 'c.ts')).toEqual({ ok: true, path: join(t.path, 'c.ts') })
    expect(FileOps.rename(join(t.path, 'c.ts'), 'C.ts')).toEqual({ ok: true, path: join(t.path, 'C.ts') })
    expect(FileOps.rename(join(t.path, 'C.ts'), 'x/y')).toMatchObject({ ok: false, error: 'nom invalide' })
    t.dispose()
  })

  it('copies (free names, folders recursive), moves, refuses a folder into itself', () => {
    const t = new TempDir()
    t.write('src/a.ts', 'A'); t.write('src/sub/b.ts', 'B'); t.write('dest/a.ts', 'OLD')
    const src = join(t.path, 'src'), dest = join(t.path, 'dest')
    expect(FileOps.transfer(join(src, 'a.ts'), dest, false)).toEqual({ ok: true, path: join(dest, 'a copie.ts') })
    expect(readFileSync(join(dest, 'a.ts'), 'utf8')).toBe('OLD')
    expect(FileOps.transfer(join(src, 'a.ts'), src, false)).toEqual({ ok: true, path: join(src, 'a copie.ts') })   // duplicate
    expect(FileOps.transfer(join(src, 'sub'), dest, false)).toEqual({ ok: true, path: join(dest, 'sub') })
    expect(readFileSync(join(dest, 'sub', 'b.ts'), 'utf8')).toBe('B')
    expect(FileOps.transfer(src, join(src, 'sub'), false)).toMatchObject({ ok: false, error: expect.stringMatching(/lui-même/) })
    expect(FileOps.transfer(src, src, true)).toMatchObject({ ok: false })
    expect(FileOps.transfer(join(src, 'sub'), dest, true)).toEqual({ ok: true, path: join(dest, 'sub copie') })
    expect(existsSync(join(src, 'sub'))).toBe(false)
    expect(FileOps.transfer(join(src, 'a.ts'), src, true)).toEqual({ ok: true, path: join(src, 'a.ts') })   // move in place: nothing
    expect(FileOps.transfer(join(t.path, 'nope'), dest, false)).toMatchObject({ ok: false })
    expect(FileOps.transfer(join(src, 'a.ts'), join(src, 'a.ts'), false)).toMatchObject({ ok: false })
    expect(readdirSync(dest).sort()).toEqual(['a copie.ts', 'a.ts', 'sub', 'sub copie'])
    t.dispose()
  })
})
