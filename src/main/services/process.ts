import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import type { ClaudeProcess } from '@shared/ipc'

const run = (file: string, args: string[]) => new Promise<string>((resolve) => {
  execFile(file, args, { env: { LC_ALL: 'C', PATH: '/usr/bin:/bin:/usr/sbin:/sbin' }, maxBuffer: 16_000_000 }, (_e, out) => resolve(String(out ?? '')))
})

/** Running `claude` processes on this machine (ps + lsof on macOS/Linux; tasklist later on Windows). */
export async function scanClaudeProcesses(): Promise<ClaudeProcess[]> {
  if (process.platform === 'win32') return []
  const ps = await run('/bin/ps', ['-axo', 'pid=,ppid=,lstart=,etime=,%cpu=,rss=,command='])
  interface Row { pid: number; ppid: number; started: number; etime: string; cpu: string; rss: number; cmd: string }
  const rows: Row[] = []
  for (const line of ps.split('\n')) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 11) continue
    const pid = +parts[0], ppid = +parts[1]
    if (!pid) continue
    const started = Date.parse(parts.slice(2, 7).join(' ')) || Date.now()
    rows.push({ pid, ppid, started, etime: parts[7], cpu: parts[8], rss: +parts[9] || 0, cmd: parts.slice(10).join(' ') })
  }
  const isClaude = (c: string) => { const exe = c.split(' ')[0] ?? ''; return exe === 'claude' || exe.endsWith('/claude') }
  const home = homedir()
  const claude: ClaudeProcess[] = rows.filter((r) => isClaude(r.cmd)).map((r) => ({ pid: r.pid, started: r.started, elapsed: r.etime, cpu: r.cpu, memMB: Math.round(r.rss / 1024), cwd: '?', children: [] }))
  if (!claude.length) return []
  for (const c of claude) {
    const frontier = [c.pid], seen = new Set<number>()
    while (frontier.length) {
      const p = frontier.pop()!
      for (const r of rows) {
        if (r.ppid !== p || seen.has(r.pid)) continue
        seen.add(r.pid); frontier.push(r.pid)
        const short = r.cmd.split(home).join('~')
        if (short.startsWith('/bin/zsh -c source ~/.claude/shell-snapshots')) continue
        c.children.push({ pid: r.pid, command: short.slice(0, 120), cpu: r.cpu })
      }
    }
  }
  const lsof = await run('/usr/sbin/lsof', ['-a', '-p', claude.map((c) => c.pid).join(','), '-d', 'cwd', '-Fn'])
  let current: number | null = null
  for (const line of lsof.split('\n')) {
    if (line.startsWith('p')) current = +line.slice(1)
    else if (line.startsWith('n') && current) { const c = claude.find((x) => x.pid === current); if (c) c.cwd = line.slice(1) }
  }
  return claude.sort((a, b) => b.started - a.started)
}
