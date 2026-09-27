import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { TempDir } from './helpers'
import { Links } from '../src/main/services/links'
import { Skills } from '../src/main/services/skills'
import { Mcp } from '../src/main/services/mcp'
import { FileIndex, score } from '../src/main/services/search'
import { frontmatter, isValidSkillName } from '../src/shared/frontmatter'

describe('links', () => {
  it('saves roles, additionalDirectories and deny rules, and cleans up removed links', () => {
    const t = new TempDir()
    const root = join(t.path, 'front')
    t.write('front/.claude/settings.local.json', JSON.stringify({ permissions: { allow: ['Bash(ls)'], additionalDirectories: ['/keep'] }, other: 1 }))
    Links.save(root, [{ path: '/x/api', role: 'API', readOnly: true }, { path: '/x/ds', role: '', readOnly: false }])
    let s = JSON.parse(readFileSync(join(root, '.claude', 'settings.local.json'), 'utf8'))
    expect(s.other).toBe(1)
    expect(s.permissions.allow).toEqual(['Bash(ls)'])
    expect(s.permissions.additionalDirectories).toEqual(['/keep', '/x/api', '/x/ds'])
    expect(s.permissions.deny).toEqual(['Edit(///x/api/**)', 'Write(///x/api/**)'])
    expect(Links.load(root)).toEqual([{ path: '/x/api', role: 'API', readOnly: true }, { path: '/x/ds', role: '', readOnly: false }])
    expect(readFileSync(Links.promptPath(root), 'utf8')).toContain('api (API) : /x/api [lecture seule')
    // remove one link: its dir and deny rules go, foreign entries stay
    Links.save(root, [{ path: '/x/ds', role: '', readOnly: false }])
    s = JSON.parse(readFileSync(join(root, '.claude', 'settings.local.json'), 'utf8'))
    expect(s.permissions.additionalDirectories).toEqual(['/keep', '/x/ds'])
    expect(s.permissions.deny).toBeUndefined()
    Links.save(root, [])
    expect(existsSync(Links.promptPath(root))).toBe(false)
    t.dispose()
  })
  it('refuses to overwrite an unreadable settings.local.json', () => {
    const t = new TempDir()
    t.write('p/.claude/settings.local.json', '{ broken')
    expect(() => Links.save(join(t.path, 'p'), [{ path: '/x', role: '', readOnly: false }])).toThrow(/illisible/)
    expect(readFileSync(join(t.path, 'p', '.claude', 'settings.local.json'), 'utf8')).toBe('{ broken')
    t.dispose()
  })
})

describe('skills', () => {
  it('lists project skills and commands with front matter, creates and removes', () => {
    const t = new TempDir()
    const sk = new Skills(t.path)
    t.write('proj/.claude/skills/deploy/SKILL.md', '---\nname: deploy\ndescription: "Déploie"\ndisable-model-invocation: true\n---\n# deploy\n')
    t.write('proj/.claude/commands/review.md', 'Relis le diff.\n')
    t.write('.claude/skills/perso/SKILL.md', '---\nname: perso\n---\n')
    t.write('.claude/plugins/cache/market/cf/skills/wrangler/SKILL.md', '---\nname: wrangler\ndescription: CLI\n---\n')
    const p = sk.project(join(t.path, 'proj'))
    expect(p.map((s) => [s.name, s.isCommand, s.manualOnly])).toEqual([['deploy', false, true], ['review', true, false]])
    expect(p[1].description).toBe('Relis le diff.')
    expect(sk.personal().map((s) => s.name)).toEqual(['perso'])
    expect(sk.plugins().map((s) => s.name)).toEqual(['cf:wrangler'])
    const created = sk.create('new-skill', 'desc', join(t.path, 'proj'))
    expect(readFileSync(created, 'utf8')).toContain('name: new-skill')
    expect(() => sk.create('new-skill', 'desc', join(t.path, 'proj'))).toThrow(/existe/)
    sk.remove(sk.project(join(t.path, 'proj')).find((s) => s.name === 'new-skill')!)
    expect(existsSync(created)).toBe(false)
    expect(isValidSkillName('a-b1')).toBe(true); expect(isValidSkillName('A b')).toBe(false)
    expect(frontmatter("---\nk: 'v'\n---\n")).toEqual({ k: 'v' })
    t.dispose()
  })
})

describe('mcp', () => {
  it('reads and writes .mcp.json, keeps unknown keys, parses claude mcp list', () => {
    const t = new TempDir()
    const root = join(t.path, 'p')
    t.write('p/.mcp.json', JSON.stringify({ mcpServers: { fs: { command: 'npx', args: ['-y', 'fs'] }, web: { type: 'http', url: 'https://x/mcp' } }, extra: true }))
    t.write('.claude.json', JSON.stringify({ mcpServers: { global: { command: 'g' } }, projects: { [root]: { mcpServers: { loc: { command: 'l' } }, disabledMcpjsonServers: ['web'] } } }))
    const m = new Mcp(t.path)
    const p = m.project(root)
    expect(p.map((s) => [s.name, s.transport, s.disabled])).toEqual([['fs', 'stdio', false], ['web', 'http', true]])
    expect(m.user().map((s) => s.name)).toEqual(['global'])
    expect(m.local(root).map((s) => s.name)).toEqual(['loc'])
    m.write({ ...p[0], name: 'fs2', args: ['a'] }, root, 'fs')
    const j = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf8'))
    expect(Object.keys(j.mcpServers).sort()).toEqual(['fs2', 'web'])
    expect(j.mcpServers.fs2).toEqual({ type: 'stdio', command: 'npx', args: ['a'] })
    expect(j.extra).toBe(true)
    m.remove('web', root)
    expect(Object.keys(JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf8')).mcpServers)).toEqual(['fs2'])
    expect(Mcp.parseList('Checking MCP server health...\n\nfs: npx -y fs - ✔ Connected\nweb: https://x/mcp (HTTP) - ✗ Needs authentication\nbad: x - ✗ Failed to connect')).toEqual([
      { name: 'fs', target: 'npx -y fs', health: 'connected' }, { name: 'web', target: 'https://x/mcp (HTTP)', health: 'needsAuth' }, { name: 'bad', target: 'x', health: 'failed' },
    ])
    expect(Mcp.addArgs({ ...p[0], env: { K: 'v' } }, 'user')).toEqual(['add', '-s', 'user', '-t', 'stdio', '-e', 'K=v', 'fs', '--', 'npx', '-y', 'fs'])
    t.write('p/.mcp.json', '{ broken')
    expect(() => m.write(p[0], root)).toThrow(/illisible/)
    t.dispose()
  })
})

describe('search', () => {
  it('indexes files (ignoring node_modules/.git) and ranks basename matches first', () => {
    const t = new TempDir()
    t.write('src/components/Button.tsx', '')
    t.write('src/utils/button-helpers.ts', '')
    t.write('node_modules/x/button.js', '')
    t.write('.git/config', '')
    t.write('README.md', '')
    const idx = new FileIndex()
    expect(idx.files(t.path).sort()).toEqual(['README.md', 'src/components/Button.tsx', 'src/utils/button-helpers.ts'])
    const r = idx.search(t.path, 'button')
    expect(r[0]).toBe('src/components/Button.tsx')
    expect(r).toHaveLength(2)
    expect(idx.search(t.path, 'bttn').sort()).toEqual(['src/components/Button.tsx', 'src/utils/button-helpers.ts'])
    expect(idx.search(t.path, 'srcbtn')).toEqual([])
    expect(score('abc', 'zz')).toBe(0)
    expect(idx.search(t.path, 'zzz')).toEqual([])
    t.dispose()
  })
})
