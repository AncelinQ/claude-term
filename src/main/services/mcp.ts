import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { execFile } from 'node:child_process'
import type { MCPServer } from '@shared/ipc'

/**
 * MCP servers: `.mcp.json` of a project (ours to edit), `~/.claude.json` for user/local scopes
 * (read only: user scope changes go through `claude mcp add|remove`).
 */
export class Mcp {
  readonly userConfigPath: string
  constructor(home = homedir(), private claudeBinary: () => string | null = () => null) {
    this.userConfigPath = join(home, '.claude.json')
  }

  static from(name: string, o: any, scope: MCPServer['scope'], sourcePath: string): MCPServer {
    const s: MCPServer = { name, transport: 'stdio', command: '', args: [], url: '', env: {}, headers: {}, scope, sourcePath, disabled: false }
    if (typeof o.url === 'string') { s.url = o.url; s.transport = o.type === 'sse' ? 'sse' : 'http' }
    if (typeof o.command === 'string') s.command = o.command
    if (Array.isArray(o.args)) s.args = o.args.map(String)
    if (o.env && typeof o.env === 'object') s.env = o.env
    if (o.headers && typeof o.headers === 'object') s.headers = o.headers
    if (o.type === 'stdio' || (!o.url && o.command)) s.transport = 'stdio'
    return s
  }

  static toJson(s: MCPServer): any {
    const o: any = {}
    if (s.transport === 'stdio') {
      o.type = 'stdio'; o.command = s.command
      if (s.args.length) o.args = s.args
      if (Object.keys(s.env).length) o.env = s.env
    } else {
      o.type = s.transport; o.url = s.url
      if (Object.keys(s.headers).length) o.headers = s.headers
    }
    return o
  }

  project(root: string, scope: MCPServer['scope'] = 'project'): MCPServer[] {
    const p = join(root, '.mcp.json')
    let o: any
    try { o = JSON.parse(readFileSync(p, 'utf8')) } catch { return [] }
    const servers = o?.mcpServers
    if (!servers || typeof servers !== 'object') return []
    const disabled = new Set(this.disabledInProject(root))
    return Object.keys(servers).sort().map((n) => { const s = Mcp.from(n, servers[n], scope, p); s.disabled = disabled.has(n); return s })
  }

  /** Adds or replaces a server in `.mcp.json`; refuses to overwrite unreadable JSON. */
  write(server: MCPServer, root: string, replacing?: string) {
    const p = join(root, '.mcp.json')
    let o: any = {}
    if (existsSync(p)) {
      const raw = readFileSync(p, 'utf8')
      if (raw.trim()) { try { o = JSON.parse(raw) } catch { throw new Error(".mcp.json illisible, rien n'a été écrit") } }
    }
    o.mcpServers ??= {}
    if (replacing && replacing !== server.name) delete o.mcpServers[replacing]
    o.mcpServers[server.name] = Mcp.toJson(server)
    writeFileSync(p, JSON.stringify(o, null, 2) + '\n')
  }

  remove(name: string, root: string) {
    const p = join(root, '.mcp.json')
    let o: any
    try { o = JSON.parse(readFileSync(p, 'utf8')) } catch { return }
    if (!o?.mcpServers) return
    delete o.mcpServers[name]
    writeFileSync(p, JSON.stringify(o, null, 2) + '\n')
  }

  private userConfig(): any { try { return JSON.parse(readFileSync(this.userConfigPath, 'utf8')) } catch { return {} } }
  user(): MCPServer[] {
    const servers = this.userConfig().mcpServers ?? {}
    return Object.keys(servers).sort().map((n) => Mcp.from(n, servers[n], 'user', this.userConfigPath))
  }
  local(root: string): MCPServer[] {
    const servers = this.userConfig().projects?.[root]?.mcpServers ?? {}
    return Object.keys(servers).sort().map((n) => Mcp.from(n, servers[n], 'local', this.userConfigPath))
  }
  disabledInProject(root: string): string[] {
    const d = this.userConfig().projects?.[root]?.disabledMcpjsonServers
    return Array.isArray(d) ? d : []
  }
  /** Servers of other projects (recent ones), to copy from. */
  library(excluding: string | null, candidates: string[]): MCPServer[] {
    const seen = new Set<string>(), out: MCPServer[] = []
    for (const root of candidates) {
      if (root === excluding) continue
      for (const s of this.project(root)) { if (!seen.has(s.name)) { seen.add(s.name); out.push(s) } }
    }
    return out
  }

  /** `claude mcp <args>` in the project (user-scope changes and health checks). */
  cli(args: string[], cwd: string | null): Promise<{ code: number; output: string }> {
    return new Promise((resolve) => {
      const bin = this.claudeBinary() ?? 'claude'
      const env = { ...process.env }
      for (const k of Object.keys(env)) if (k.startsWith('CLAUDE_CODE_') || k === 'CLAUDECODE') delete env[k]
      execFile(bin, ['mcp', ...args], { cwd: cwd ?? undefined, env, timeout: 60_000, maxBuffer: 4_000_000 }, (err, stdout, stderr) => {
        resolve({ code: err && typeof (err as any).code === 'number' ? (err as any).code : err ? 1 : 0, output: String(stdout) + String(stderr) })
      })
    })
  }

  /** Parses `claude mcp list`: "name: target - ✔ Connected" lines. */
  static parseList(text: string): { name: string; target: string; health: MCPServer['health'] }[] {
    const out: { name: string; target: string; health: MCPServer['health'] }[] = []
    for (const raw of text.split('\n')) {
      const line = raw.trim()
      const sep = line.lastIndexOf(' - ')
      if (sep < 0) continue
      const head = line.slice(0, sep)
      const colon = head.lastIndexOf(': ')
      if (colon < 0) continue
      const status = line.slice(sep + 3)
      out.push({ name: head.slice(0, colon).trim(), target: head.slice(colon + 2).trim(), health: status.startsWith('✔') ? 'connected' : /auth/i.test(status) ? 'needsAuth' : 'failed' })
    }
    return out
  }

  static addArgs(s: MCPServer, scope: string): string[] {
    const a = ['add', '-s', scope, '-t', s.transport]
    for (const [k, v] of Object.entries(s.env)) a.push('-e', `${k}=${v}`)
    for (const [k, v] of Object.entries(s.headers)) a.push('-H', `${k}: ${v}`)
    a.push(s.name)
    if (s.transport === 'stdio') { a.push('--', s.command, ...s.args) } else a.push(s.url)
    return a
  }
}
