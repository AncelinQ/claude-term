import { cpSync, existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative, isAbsolute } from 'node:path'

export type OpResult = { ok: true; path: string } | { ok: false; error: string }

/** "a.ts" → "a copie.ts", then "a copie 2.ts"… (Finder's French naming), the first free name in `dir` */
export function freeName(dir: string, name: string, exists: (p: string) => boolean): string {
  if (!exists(join(dir, name))) return name
  const ext = name.startsWith('.') && !name.slice(1).includes('.') ? '' : extname(name)
  const stem = ext ? name.slice(0, -ext.length) : name
  for (let i = 1; ; i++) { const n = `${stem} copie${i > 1 ? ' ' + i : ''}${ext}`; if (!exists(join(dir, n))) return n }
}

const inside = (child: string, parent: string) => { const r = relative(parent, child); return r === '' || (!r.startsWith('..') && !isAbsolute(r)) }
const validName = (n: string) => !!n && !/[\\/]/.test(n) && n !== '.' && n !== '..'
const err = (e: unknown): OpResult => ({ ok: false, error: String((e as Error)?.message ?? e) })

/**
 * File management of the explorer (main side). Never overwrites: a name already taken is refused (create, rename),
 * a copy gets a free name; a folder cannot go into itself. Deletion is not here: it goes to the Trash (shell.trashItem).
 */
export const FileOps = {
  create(dir: string, name: string, folder: boolean): OpResult {
    if (!validName(name)) return { ok: false, error: 'nom invalide' }
    const p = join(dir, name)
    if (existsSync(p)) return { ok: false, error: `« ${name} » existe déjà` }
    try { if (folder) mkdirSync(p); else { mkdirSync(dir, { recursive: true }); writeFileSync(p, '', { flag: 'wx' }) } return { ok: true, path: p } } catch (e) { return err(e) }
  },

  rename(path: string, name: string): OpResult {
    if (!validName(name)) return { ok: false, error: 'nom invalide' }
    const to = join(dirname(path), name)
    if (to === path) return { ok: true, path }
    // a change of case only is allowed on case-insensitive disks (macOS, Windows)
    if (existsSync(to) && name.toLowerCase() !== basename(path).toLowerCase()) return { ok: false, error: `« ${name} » existe déjà` }
    try { renameSync(path, to); return { ok: true, path: to } } catch (e) { return err(e) }
  },

  /** copy (or move) `src` into the folder `destDir`; a copy in the same folder, or a taken name, gets "copie" */
  transfer(src: string, destDir: string, move: boolean): OpResult {
    try {
      if (!existsSync(src)) return { ok: false, error: 'introuvable : ' + basename(src) }
      if (!statSync(destDir).isDirectory()) return { ok: false, error: "la destination n'est pas un dossier" }
      if (statSync(src).isDirectory() && inside(destDir, src)) return { ok: false, error: 'un dossier ne peut pas aller dans lui-même' }
      if (move && dirname(src) === destDir) return { ok: true, path: src }
      const to = join(destDir, freeName(destDir, basename(src), existsSync))
      if (move) { try { renameSync(src, to) } catch { cpSync(src, to, { recursive: true, errorOnExist: true, force: false }); rmSync(src, { recursive: true }) } }
      else cpSync(src, to, { recursive: true, errorOnExist: true, force: false })
      return { ok: true, path: to }
    } catch (e) { return err(e) }
  },
}
