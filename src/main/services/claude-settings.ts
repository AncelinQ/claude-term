import { existsSync, readFileSync, writeFileSync } from 'node:fs'

/**
 * Minimal editor of ~/.claude/settings.json for our hook entries. Unknown keys are preserved;
 * an unreadable file is never overwritten.
 */
export class ClaudeSettings {
  constructor(private path: string) {}

  read(): { ok: true; data: any } | { ok: false; error: string } {
    if (!existsSync(this.path)) return { ok: true, data: {} }
    try { return { ok: true, data: JSON.parse(readFileSync(this.path, 'utf8')) } }
    catch (e) { return { ok: false, error: `settings.json illisible : ${e}` } }
  }

  /** Commands registered for an event (flattened over matchers). */
  hookCommands(data: any, event: string): string[] {
    const groups = data?.hooks?.[event]
    if (!Array.isArray(groups)) return []
    return groups.flatMap((g: any) => (Array.isArray(g?.hooks) ? g.hooks : []).map((h: any) => h?.command).filter((c: any) => typeof c === 'string'))
  }

  hasHook(data: any, event: string, command: string): boolean {
    return this.hookCommands(data, event).includes(command)
  }

  /** Adds `command` under `event` (own matcher group), or removes every group entry matching `isOurs`. */
  setHook(data: any, event: string, command: string, on: boolean, isOurs: (c: string) => boolean) {
    data.hooks ??= {}
    let groups: any[] = Array.isArray(data.hooks[event]) ? data.hooks[event] : []
    groups = groups.map((g) => ({ ...g, hooks: (Array.isArray(g?.hooks) ? g.hooks : []).filter((h: any) => !(typeof h?.command === 'string' && isOurs(h.command))) }))
      .filter((g) => g.hooks.length > 0)
    if (on) groups.push({ matcher: '', hooks: [{ type: 'command', command }] })
    if (groups.length) data.hooks[event] = groups
    else delete data.hooks[event]
    if (Object.keys(data.hooks).length === 0) delete data.hooks
  }

  write(data: any) {
    writeFileSync(this.path, JSON.stringify(data, null, 2) + '\n')
  }
}
