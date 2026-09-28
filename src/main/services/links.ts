import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { LinkedProject } from '@shared/ipc'

/**
 * Linked folders of a project, kept in the app's data, never in the project (the paths are specific to this
 * machine): `userData/projects.json` holds the links by project root; `userData/projects/<key>/` holds what Claude
 * gets at launch (`--settings settings.json` = additionalDirectories + deny rules for read-only links,
 * `--append-system-prompt-file prompt.txt`). Earlier versions wrote `.claude/claudeterm.json`,
 * `.claude/claudeterm-prompt.txt` and entries of `.claude/settings.local.json` in the project: `load` moves them
 * here once and removes them from the project.
 */
export class ProjectLinks {
  readonly index: string
  constructor(private base: string) { this.index = join(base, 'projects.json') }

  private all(): Record<string, { links: LinkedProject[] }> { try { return JSON.parse(readFileSync(this.index, 'utf8')) } catch { return {} } }

  /** Per-project folder of the launch files. */
  dir(root: string) { return join(this.base, 'projects', createHash('sha1').update(root).digest('hex').slice(0, 16)) }
  settingsPath(root: string) { return join(this.dir(root), 'settings.json') }
  promptPath(root: string) { return join(this.dir(root), 'prompt.txt') }

  load(root: string): LinkedProject[] {
    const entry = this.all()[root]
    if (entry) return entry.links
    const legacy = migrateFromProject(root)
    if (legacy) { this.save(root, legacy); return legacy }
    return []
  }

  save(root: string, links: LinkedProject[]) {
    const all = this.all()
    if (links.length) all[root] = { links }; else delete all[root]
    mkdirSync(this.base, { recursive: true })
    writeFileSync(this.index, JSON.stringify(all, null, 2) + '\n')
    const dir = this.dir(root)
    if (!links.length) { rmSync(dir, { recursive: true, force: true }); return }
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'root.txt'), root + '\n')   // which project this folder belongs to, for humans
    writeFileSync(this.settingsPath(root), JSON.stringify(launchSettings(links), null, 2) + '\n')
    writeFileSync(this.promptPath(root), systemPrompt(root, links))
  }

  /** `claude` arguments for a project: its linked folders, the read-only rules and the context prompt. */
  claudeArgs(root: string | undefined | null): string[] {
    if (!root || !this.load(root).length) return []
    return ['--settings', this.settingsPath(root), '--append-system-prompt-file', this.promptPath(root)]
  }
}

// rule syntax: a single leading "/" is project-relative, "//" is absolute. Edit rules cover every file-editing tool
// (Claude Code warns that Write(...) rules are never matched)
const denyRules = (p: string) => [`Edit(//${p}/**)`]

export function launchSettings(links: LinkedProject[]) {
  const deny = links.filter((l) => l.readOnly).flatMap((l) => denyRules(l.path))
  return { permissions: { additionalDirectories: links.map((l) => l.path), ...(deny.length ? { deny } : {}) } }
}

export function systemPrompt(root: string, links: LinkedProject[]): string {
  if (!links.length) return ''
  let s = `Ce projet (${basename(root)}, ${root}) fait partie d'un ensemble de projets liés, déjà accessibles sans demander :\n`
  for (const l of links) s += `- ${basename(l.path)}${l.role ? ` (${l.role})` : ''} : ${l.path}${l.readOnly ? ' [lecture seule : ne pas modifier]' : ''}\n`
  return s + "Va lire ces dossiers directement quand une tâche touche à leurs interfaces (API, composants, types) au lieu de demander où ils sont."
}

/**
 * Moves the links an earlier version stored in the project out of it: reads `.claude/claudeterm.json`, removes our
 * entries from `.claude/settings.local.json` (everything else in it is kept; the file goes when nothing is left),
 * deletes our two files and `.claude` when it ends up empty. Returns the links, null when there was nothing.
 */
export function migrateFromProject(root: string): LinkedProject[] | null {
  const dir = join(root, '.claude'), ours = join(dir, 'claudeterm.json')
  if (!existsSync(ours)) return null
  let links: LinkedProject[] = []
  try { links = JSON.parse(readFileSync(ours, 'utf8')).links ?? [] } catch { /* unreadable: nothing to import, still cleaned */ }
  const sp = join(dir, 'settings.local.json')
  if (existsSync(sp)) {
    let settings: any
    try { settings = JSON.parse(readFileSync(sp, 'utf8') || '{}') } catch { settings = null }   // unreadable: left alone
    if (settings && typeof settings === 'object') {
      const paths = new Set(links.map((l) => l.path))
      const perms = settings.permissions ?? {}
      const dirs = (perms.additionalDirectories ?? []).filter((d: string) => !paths.has(d))
      if (dirs.length) perms.additionalDirectories = dirs; else delete perms.additionalDirectories
      const rules = new Set([...paths].flatMap((p) => [`Edit(//${p}/**)`, `Write(//${p}/**)`, `Edit(${p}/**)`, `Write(${p}/**)`]))
      const deny = (perms.deny ?? []).filter((r: string) => !rules.has(r))
      if (deny.length) perms.deny = deny; else delete perms.deny
      if (Object.keys(perms).length) settings.permissions = perms; else delete settings.permissions
      if (Object.keys(settings).length) writeFileSync(sp, JSON.stringify(settings, null, 2) + '\n'); else unlinkSync(sp)
    }
  }
  for (const f of [ours, join(dir, 'claudeterm-prompt.txt')]) { try { unlinkSync(f) } catch { /* gone */ } }
  try { if (!readdirSync(dir).length) rmdirSync(dir) } catch { /* not empty */ }
  return links
}
