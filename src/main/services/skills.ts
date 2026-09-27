import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { homedir } from 'node:os'
import { frontmatter, firstLine } from '@shared/frontmatter'
import type { SkillInfo } from '@shared/ipc'

/** Skills (`.claude/skills/<name>/SKILL.md`) and legacy commands (`.claude/commands/*.md`). */
export class Skills {
  readonly personalSkills: string
  readonly personalCommands: string
  readonly pluginsCache: string

  constructor(home = homedir()) {
    this.personalSkills = join(home, '.claude', 'skills')
    this.personalCommands = join(home, '.claude', 'commands')
    this.pluginsCache = join(home, '.claude', 'plugins', 'cache')
  }

  project(root: string, source: SkillInfo['source'] = 'project'): SkillInfo[] {
    return [...skills(join(root, '.claude', 'skills'), source), ...commands(join(root, '.claude', 'commands'), source)]
  }
  personal(): SkillInfo[] {
    return [...skills(this.personalSkills, 'personal'), ...commands(this.personalCommands, 'personal')]
  }
  /** `<cache>/<marketplace>/<plugin>/**\/skills/<name>/SKILL.md` → "plugin:name" */
  plugins(): SkillInfo[] {
    const out: SkillInfo[] = []
    const walk = (dir: string, depth: number, plugin: string | null) => {
      if (depth > 8) return
      let entries
      try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const e of entries) {
        const p = join(dir, e.name)
        if (e.isDirectory()) walk(p, depth + 1, depth === 1 ? e.name : plugin)
        else if (e.name === 'SKILL.md' && p.includes('/skills/')) {
          const fm = read(p)
          out.push(info(`${plugin ?? 'plugin'}:${fm['name'] ?? basename(dirname(p))}`, fm, p, 'plugin', false))
        }
      }
    }
    walk(this.pluginsCache, 0, null)
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }

  /** Creates `<base>/.claude/skills/<name>/SKILL.md` (personal when no root) with a front matter skeleton. */
  create(name: string, description: string, root: string | null): string {
    const base = root ? join(root, '.claude', 'skills') : this.personalSkills
    const dir = join(base, name), path = join(dir, 'SKILL.md')
    if (existsSync(path)) throw new Error(`Le skill « ${name} » existe déjà`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(path, `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n<!-- Instructions pour Claude : quand utiliser ce skill, étapes, contraintes. -->\n`)
    return path
  }

  remove(s: SkillInfo) {
    if (s.source === 'plugin') throw new Error('Skill de plugin : non modifiable')
    rmSync(s.isCommand ? s.path : dirname(s.path), { recursive: true, force: true })
  }
}

function read(p: string) { try { return frontmatter(readFileSync(p, 'utf8')) } catch { return {} } }
function info(name: string, fm: Record<string, string>, path: string, source: SkillInfo['source'], isCommand: boolean, desc?: string): SkillInfo {
  return { name, description: fm['description'] ?? desc ?? '', path, source, isCommand, manualOnly: fm['disable-model-invocation'] === 'true', autoOnly: fm['user-invocable'] === 'false' }
}
function skills(dir: string, source: SkillInfo['source']): SkillInfo[] {
  let names: string[]
  try { names = readdirSync(dir) } catch { return [] }
  return names.flatMap((n) => {
    const p = join(dir, n, 'SKILL.md')
    if (!existsSync(p)) return []
    const fm = read(p)
    return [info(fm['name'] ?? n, fm, p, source, false)]
  }).sort((a, b) => a.name.localeCompare(b.name))
}
function commands(dir: string, source: SkillInfo['source']): SkillInfo[] {
  let names: string[]
  try { names = readdirSync(dir) } catch { return [] }
  return names.filter((n) => n.endsWith('.md')).map((n) => {
    const p = join(dir, n)
    let text = ''
    try { text = readFileSync(p, 'utf8') } catch { /* unreadable */ }
    return info(n.slice(0, -3), frontmatter(text), p, source, true, firstLine(text))
  }).sort((a, b) => a.name.localeCompare(b.name))
}
