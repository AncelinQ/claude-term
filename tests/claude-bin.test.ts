import { describe, it, expect } from 'vitest'
import { claudeInvocation, envPath, findClaude } from '../src/main/services/claude-bin'

const fs = (...files: string[]) => (p: string) => files.includes(p)

describe('claude binary', () => {
  it('reads PATH whatever its case', () => {
    expect(envPath({ Path: 'C:\\a;C:\\b' })).toBe('C:\\a;C:\\b')
    expect(envPath({ PATH: '/usr/bin' })).toBe('/usr/bin')
    expect(envPath({})).toBe('')
  })

  it('finds claude on Windows: PATH (Path), native installer, npm shim', () => {
    const env = { Path: 'C:\\Windows;C:\\Users\\me\\AppData\\Roaming\\npm', USERPROFILE: 'C:\\Users\\me', APPDATA: 'C:\\Users\\me\\AppData\\Roaming' }
    expect(findClaude(env, 'win32', fs('C:\\Users\\me\\AppData\\Roaming\\npm\\claude.cmd'))).toBe('C:\\Users\\me\\AppData\\Roaming\\npm\\claude.cmd')
    // .exe wins in the same folder
    expect(findClaude(env, 'win32', fs('C:\\Windows\\claude.exe', 'C:\\Windows\\claude.cmd'))).toBe('C:\\Windows\\claude.exe')
    const noPath = { USERPROFILE: 'C:\\Users\\me', APPDATA: 'C:\\Users\\me\\AppData\\Roaming' }
    expect(findClaude(noPath, 'win32', fs('C:\\Users\\me\\.local\\bin\\claude.exe'))).toBe('C:\\Users\\me\\.local\\bin\\claude.exe')
    expect(findClaude(noPath, 'win32', fs('C:\\Users\\me\\AppData\\Roaming\\npm\\claude.cmd'))).toBe('C:\\Users\\me\\AppData\\Roaming\\npm\\claude.cmd')
    expect(findClaude(noPath, 'win32', fs())).toBeNull()
  })

  it('finds claude on macOS / Linux', () => {
    expect(findClaude({ PATH: '/usr/bin:/opt/x/bin', HOME: '/Users/me' }, 'darwin', fs('/opt/x/bin/claude'))).toBe('/opt/x/bin/claude')
    expect(findClaude({ PATH: '', HOME: '/Users/me' }, 'darwin', fs('/Users/me/.local/bin/claude'))).toBe('/Users/me/.local/bin/claude')
    expect(findClaude({ HOME: '/h' }, 'linux', fs('/usr/local/bin/claude'))).toBe('/usr/local/bin/claude')
  })

  it('starts a Windows npm shim through its cli.js (non interactive) or cmd.exe (terminal)', () => {
    const shim = 'C:\\Users\\me\\AppData\\Roaming\\npm\\claude.cmd'
    const cli = 'C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js'
    const base = { execPath: 'C:\\Program Files\\ClaudeTerm\\ClaudeTerm.exe', comspec: 'C:\\Windows\\system32\\cmd.exe' }
    expect(claudeInvocation('/usr/bin/claude', ['mcp', 'list'], { ...base, interactive: false, exists: fs() })).toEqual({ file: '/usr/bin/claude', args: ['mcp', 'list'] })
    expect(claudeInvocation('C:\\x\\claude.exe', ['--resume', 'id'], { ...base, interactive: true, exists: fs() })).toEqual({ file: 'C:\\x\\claude.exe', args: ['--resume', 'id'] })
    expect(claudeInvocation(shim, ['mcp', 'add', 'x', 'https://h/?a=1&b=2'], { ...base, interactive: false, exists: fs(cli) }))
      .toEqual({ file: base.execPath, args: [cli, 'mcp', 'add', 'x', 'https://h/?a=1&b=2'], env: { ELECTRON_RUN_AS_NODE: '1' } })
    expect(claudeInvocation(shim, ['--resume', 'abc-123'], { ...base, interactive: true, exists: fs(cli) }))
      .toEqual({ file: base.comspec, args: ['/d', '/s', '/c', `"${shim} --resume abc-123"`], verbatim: true })
    // no cli.js next to the shim: cmd.exe with quoted arguments (& inside quotes, % and ! neutralized)
    expect(claudeInvocation(shim, ['mcp', 'add', 'a b', 'u?x=1&y="2"%P%!'], { ...base, interactive: false, exists: fs() }).args[3])
      .toBe(`"${shim} mcp add "a b" "u?x=1&y=""2"""^%"P"^%""^!"""`)
    expect(claudeInvocation(shim, [], { execPath: 'e', interactive: true, exists: fs() }).file).toBe('cmd.exe')
  })
})
