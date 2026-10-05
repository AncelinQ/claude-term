import { describe, it, expect, afterEach } from 'vitest'
import { chmodSync, existsSync, readFileSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { TempDir } from './helpers'
import { Restore } from '../src/main/services/restore'

describe('restore a file to its state before the session', () => {
  let t: TempDir
  afterEach(() => t?.dispose())
  const setup = () => {
    t = new TempDir()
    return { file: t.write('proj/a.ts', 'after\n'), backup: t.write('history/abc@v1', 'before\n'), restore: new Restore(join(t.path, 'undo')) }
  }

  it('previews what changes, and what blocks it', () => {
    const { file, backup, restore } = setup()
    const p = restore.plan(file, backup)
    expect(p).toMatchObject({ ok: true, action: 'write', blockers: [], warnings: [] })
    expect(p.diff).toContain('-after')
    expect(p.diff).toContain('+before')
    expect(p.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(restore.plan(file, join(t.path, 'history/missing')).blockers).toEqual(['la sauvegarde de Claude Code est introuvable'])
    writeFileSync(file, 'before\n')
    expect(restore.plan(file, backup).blockers).toEqual(['le fichier est déjà dans cet état'])
    expect(restore.plan(join(t.path, 'proj/gone.ts'), null).blockers).toEqual(['le fichier créé par la session n’existe plus'])
  })

  it('warns when the file changed after the session last wrote it', () => {
    const { file, backup, restore } = setup()
    const wrote = Date.now() - 60_000
    utimesSync(file, new Date(), new Date())
    expect(restore.plan(file, backup, wrote).warnings).toHaveLength(1)
    expect(restore.plan(file, backup, Date.now()).warnings).toHaveLength(0)
  })

  it('writes the backup back, keeps the mode, and undoes it', async () => {
    const { file, backup, restore } = setup()
    if (process.platform !== 'win32') chmodSync(file, 0o755)
    const mode = statSync(file).mode
    const { hash } = restore.plan(file, backup)
    const r = await restore.apply(file, backup, hash, async () => { throw new Error('no trash here') })
    expect(r.ok).toBe(true)
    expect(readFileSync(file, 'utf8')).toBe('before\n')
    expect(statSync(file).mode).toBe(mode)
    expect(existsSync(file + '.claudeterm-restore')).toBe(false)
    expect(restore.undo(r.undoId!)).toEqual({ ok: true })
    expect(readFileSync(file, 'utf8')).toBe('after\n')
  })

  it('refuses a file that changed since the preview, and an undo after a later change', async () => {
    const { file, backup, restore } = setup()
    const { hash } = restore.plan(file, backup)
    writeFileSync(file, 'edited meanwhile\n')
    expect(await restore.apply(file, backup, hash, async () => {})).toEqual({ ok: false, error: 'le fichier a changé depuis l’aperçu' })
    const r = await restore.apply(file, backup, restore.plan(file, backup).hash, async () => {})
    writeFileSync(file, 'edited after the restore\n')
    expect(restore.undo(r.undoId!)).toEqual({ ok: false, error: 'le fichier a changé depuis la restauration' })
    expect(restore.undo('../x')).toEqual({ ok: false, error: 'identifiant invalide' })
  })

  it('a file the session created goes to the Trash; undo puts it back', async () => {
    const { file, restore } = setup()
    const p = restore.plan(file, null)
    expect(p.action).toBe('trash')
    const trashed: string[] = []
    const r = await restore.apply(file, null, p.hash, async (f) => { trashed.push(f); unlinkSync(f) })
    expect(trashed).toEqual([file])
    expect(existsSync(file)).toBe(false)
    expect(restore.undo(r.undoId!)).toEqual({ ok: true })
    expect(readFileSync(file, 'utf8')).toBe('after\n')
  })
})
