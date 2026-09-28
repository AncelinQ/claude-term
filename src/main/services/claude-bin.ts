import { win32, posix } from 'node:path'

/** Reads PATH whatever its case (Windows names it "Path"; a spread copy of process.env loses the case-insensitivity). */
export function envPath(env: Record<string, string | undefined>): string {
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH')
  return (key && env[key]) || ''
}

/** Where `claude` is: PATH first, then the install locations of the npm, bun, native and local installers. */
export function findClaude(env: Record<string, string | undefined>, platform: string, exists: (p: string) => boolean): string | null {
  const win = platform === 'win32'
  const path = win ? win32 : posix
  const names = win ? ['claude.exe', 'claude.cmd'] : ['claude']
  for (const dir of envPath(env).split(win ? ';' : ':')) {
    for (const n of names) if (dir && exists(path.join(dir, n))) return path.join(dir, n)
  }
  const home = env.HOME || env.USERPROFILE || ''
  const fallbacks = win
    ? [path.join(home, '.local', 'bin', 'claude.exe'), ...(env.APPDATA ? [path.join(env.APPDATA, 'npm', 'claude.cmd')] : []), path.join(home, '.claude', 'local', 'claude.cmd'), path.join(home, '.bun', 'bin', 'claude.exe')]
    : [path.join(home, '.local', 'bin', 'claude'), path.join(home, '.claude', 'local', 'claude'), path.join(home, '.bun', 'bin', 'claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude']
  return fallbacks.find((p) => exists(p)) ?? null
}

/** verbatim: args already form the Windows command line (no further quoting by Node / node-pty) */
export interface Invocation { file: string; args: string[]; env?: Record<string, string>; verbatim?: boolean }

/**
 * How to start `claude <args>`. A Windows npm shim (claude.cmd) cannot be spawned directly: non-interactive calls
 * run its cli.js with Electron as Node (no cmd.exe parsing of user arguments such as MCP URLs with "&"); a terminal
 * goes through cmd.exe (only fixed arguments there).
 */
export function claudeInvocation(bin: string, args: string[], opts: { interactive: boolean; execPath: string; comspec?: string; exists: (p: string) => boolean }): Invocation {
  if (!/\.cmd$/i.test(bin)) return { file: bin, args }
  const cli = win32.join(win32.dirname(bin), 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js')
  if (!opts.interactive && opts.exists(cli)) return { file: opts.execPath, args: [cli, ...args], env: { ELECTRON_RUN_AS_NODE: '1' } }
  // /s: cmd strips the outer quotes and runs the rest as typed
  return { file: opts.comspec || 'cmd.exe', args: ['/d', '/s', '/c', `"${[bin, ...args].map(cmdQuote).join(' ')}"`], verbatim: true }
}

/** cmd.exe argument: quoted when needed, inner quotes doubled, % and ! neutralized. */
export function cmdQuote(a: string): string {
  if (/^[A-Za-z0-9_\-.:\\/=]+$/.test(a)) return a
  return '"' + a.replace(/"/g, '""').replace(/%/g, '"^%"').replace(/!/g, '"^!"') + '"'
}

