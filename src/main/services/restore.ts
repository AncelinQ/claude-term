import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { unifiedDiff } from '@shared/claude-format'
import type { RestorePlan } from '@shared/ipc'

const read = (p: string): Buffer | null => { try { return readFileSync(p) } catch { return null } }
const sha = (b: Buffer | null) => (b ? createHash('sha256').update(b).digest('hex') : 'absent')

/** Writes through a temporary file renamed over the target, keeping its mode (an executable script stays one). */
function writeAtomic(path: string, data: Buffer) {
  const tmp = path + '.claudeterm-restore'
  writeFileSync(tmp, data)
  try { chmodSync(tmp, statSync(path).mode) } catch { /* new file */ }
  renameSync(tmp, path)
}

/**
 * Puts a file back as it was before a Claude session changed it (its file-history backup). The content it replaces
 * is kept under `undoDir` first, so every restore can be undone; nothing is ever written in the project for that.
 */
export class Restore {
  constructor(private undoDir: string) {}

  /** `backup`: the backup file, null when the session created the file; `lastWrite`: the session's last write to it (ms). */
  plan(path: string, backup: string | null, lastWrite?: number): RestorePlan {
    const cur = read(path)
    const blockers: string[] = [], warnings: string[] = []
    const before = backup === null ? null : read(backup)
    if (backup !== null && !before) blockers.push('la sauvegarde de Claude Code est introuvable')
    if (backup === null && !cur) blockers.push('le fichier créé par la session n’existe plus')
    if (cur && before && cur.equals(before)) blockers.push('le fichier est déjà dans cet état')
    if (cur && lastWrite) {
      try { if (statSync(path).mtimeMs > lastWrite + 5000) warnings.push('modifié après la dernière écriture de Claude : ces changements seront remplacés aussi') } catch { /* gone */ }
    }
    const diff = unifiedDiff(cur?.toString('utf8') ?? '', before?.toString('utf8') ?? '')
    return { ok: blockers.length === 0, action: backup === null ? 'trash' : 'write', blockers, warnings, diff, hash: sha(cur) }
  }

  /** Restores when the file is still the one the preview showed (`hash`); returns the id that undoes it. */
  async apply(path: string, backup: string | null, hash: string, trash: (p: string) => Promise<void>): Promise<{ ok: boolean; error?: string; undoId?: string }> {
    const cur = read(path)
    if (sha(cur) !== hash) return { ok: false, error: 'le fichier a changé depuis l’aperçu' }
    const before = backup === null ? null : read(backup)
    if (backup !== null && !before) return { ok: false, error: 'la sauvegarde de Claude Code est introuvable' }
    const undoId = `${Date.now()}-${randomBytes(3).toString('hex')}`
    const dir = join(this.undoDir, undoId)
    mkdirSync(dir, { recursive: true })
    if (cur) writeFileSync(join(dir, 'content'), cur)
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ path, had: !!cur, restored: sha(before) }))
    try {
      if (backup === null) await trash(path)
      else writeAtomic(path, before!)
    } catch (e) { return { ok: false, error: String((e as Error).message ?? e) } }
    return { ok: true, undoId }
  }

  /** Puts back what a restore replaced, unless the file changed since the restore. */
  undo(undoId: string): { ok: boolean; error?: string } {
    if (!/^[\w-]+$/.test(undoId)) return { ok: false, error: 'identifiant invalide' }
    const dir = join(this.undoDir, undoId)
    let meta: { path: string; had: boolean; restored: string }
    try { meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) } catch { return { ok: false, error: 'restauration inconnue' } }
    const now = read(meta.path)
    if (sha(now) !== meta.restored) return { ok: false, error: 'le fichier a changé depuis la restauration' }
    try {
      if (meta.had) writeAtomic(meta.path, readFileSync(join(dir, 'content')))
      else if (existsSync(meta.path)) unlinkSync(meta.path)
    } catch (e) { return { ok: false, error: String((e as Error).message ?? e) } }
    return { ok: true }
  }
}
