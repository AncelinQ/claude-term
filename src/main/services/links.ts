import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join, basename } from 'node:path'
import type { LinkedProject } from '@shared/ipc'

/**
 * Linked folders of a project: roles in `.claude/claudeterm.json` (ours), access in
 * `.claude/settings.local.json` (Claude Code's: additionalDirectories + deny rules for read-only),
 * and a system-prompt text used by the `claude` shell wrapper.
 */
export const Links = {
  load(root: string): LinkedProject[] {
    try { return JSON.parse(readFileSync(join(root, '.claude', 'claudeterm.json'), 'utf8')).links ?? [] } catch { return [] }
  },

  save(root: string, links: LinkedProject[]) {
    mkdirSync(join(root, '.claude'), { recursive: true })
    const ours = new Set(Links.load(root).map((l) => l.path))
    writeFileSync(join(root, '.claude', 'claudeterm.json'), JSON.stringify({ links }, null, 2) + '\n')
    // Claude Code settings.local.json
    const sp = join(root, '.claude', 'settings.local.json')
    let settings: any = {}
    if (existsSync(sp)) {
      const raw = readFileSync(sp, 'utf8')
      if (raw.trim()) {
        try { settings = JSON.parse(raw) } catch { throw new Error("settings.local.json illisible, rien n'a été écrit") }
      }
    }
    const perms = settings.permissions ?? {}
    const kept: string[] = (perms.additionalDirectories ?? []).filter((d: string) => !ours.has(d))
    const dirs = [...kept, ...links.map((l) => l.path).filter((p) => !kept.includes(p))]
    if (dirs.length) perms.additionalDirectories = dirs; else delete perms.additionalDirectories
    // rule syntax: a single leading "/" is project-relative, "//" is absolute
    let deny: string[] = (perms.deny ?? []).filter((rule: string) => ![...ours].some((p) => [`Edit(//${p}/**)`, `Write(//${p}/**)`, `Edit(${p}/**)`, `Write(${p}/**)`].includes(rule)))
    for (const l of links) if (l.readOnly) deny.push(`Edit(//${l.path}/**)`, `Write(//${l.path}/**)`)
    if (deny.length) perms.deny = deny; else delete perms.deny
    if (Object.keys(perms).length) settings.permissions = perms; else delete settings.permissions
    writeFileSync(sp, JSON.stringify(settings, null, 2) + '\n')
    // prompt text
    const prompt = Links.systemPrompt(root, links)
    const pp = Links.promptPath(root)
    if (prompt) writeFileSync(pp, prompt); else if (existsSync(pp)) unlinkSync(pp)
  },

  systemPrompt(root: string, links: LinkedProject[]): string {
    if (!links.length) return ''
    let s = `Ce projet (${basename(root)}, ${root}) fait partie d'un ensemble de projets liés, déjà accessibles sans demander :\n`
    for (const l of links) {
      s += `- ${basename(l.path)}${l.role ? ` (${l.role})` : ''} : ${l.path}${l.readOnly ? ' [lecture seule : ne pas modifier]' : ''}\n`
    }
    s += "Va lire ces dossiers directement quand une tâche touche à leurs interfaces (API, composants, types) au lieu de demander où ils sont."
    return s
  },

  promptPath(root: string) { return join(root, '.claude', 'claudeterm-prompt.txt') },
}
