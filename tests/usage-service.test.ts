import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { TempDir, sleep } from './helpers'
import { ClaudeSettings } from '../src/main/services/claude-settings'
import { UsageService, statusLineScript } from '../src/main/services/usage'

const STATUS = { session_id: 's1', model: { display_name: 'Opus 5.5' }, context_window: { used_percentage: 20 }, rate_limits: { five_hour: { used_percentage: 30, resets_at: 1790530000 } } }

describe('usage service', () => {
  it('declares our status line, keeps other settings, refuses to replace a foreign one', () => {
    const t = new TempDir()
    const file = t.write('claude/settings.json', JSON.stringify({ model: 'opus', hooks: { Stop: [] } }))
    const events: unknown[] = []
    const u = new UsageService(join(t.path, 'app'), new ClaudeSettings(file), (s) => events.push(s), 'darwin')
    expect(u.state()).toMatchObject({ installed: false, snapshot: null })
    expect(u.setInstalled(true)).toEqual({ ok: true })
    const s = JSON.parse(readFileSync(file, 'utf8'))
    expect(s.model).toBe('opus')
    expect(s.hooks).toEqual({ Stop: [] })
    expect(s.statusLine).toEqual({ type: 'command', command: u.command, padding: 0 })
    expect(u.state().installed).toBe(true)
    expect(existsSync(u.script)).toBe(true)
    expect(events.length).toBe(1)
    expect(u.setInstalled(false)).toEqual({ ok: true })
    expect(JSON.parse(readFileSync(file, 'utf8')).statusLine).toBeUndefined()
    // someone else's status line: shown, never replaced nor removed
    t.write('claude/settings.json', JSON.stringify({ statusLine: { type: 'command', command: 'ccstatus' } }))
    expect(u.state()).toMatchObject({ installed: false, foreign: 'ccstatus' })
    expect(u.setInstalled(true).error).toMatch(/déjà configurée/)
    expect(u.setInstalled(false).error).toMatch(/déjà configurée/)
    expect(JSON.parse(readFileSync(file, 'utf8')).statusLine.command).toBe('ccstatus')
    // unreadable settings: nothing written
    t.write('claude/settings.json', '{ broken')
    expect(u.setInstalled(true).ok).toBe(false)
    t.dispose()
  })

  it.skipIf(process.platform === 'win32')('the script records what Claude Code pipes to it, and the service reads it', async () => {
    const t = new TempDir()
    const u = new UsageService(join(t.path, "app data'"), new ClaudeSettings(join(t.path, 'settings.json')), () => {}, 'darwin')
    expect(u.setInstalled(true).ok).toBe(true)
    const out = execFileSync('/bin/sh', ['-c', u.command], { input: JSON.stringify(STATUS), encoding: 'utf8' })
    expect(out).toBe('')
    expect(readdirSync(u.dir)).toEqual(['status.json'])
    const snap = u.read()!
    expect(snap.limits).toMatchObject([{ key: 'session', label: 'Session (5 h)', percent: 30, resetsAt: new Date(1790530000 * 1000).toISOString(), source: 'statusline' }])
    expect(snap.session).toMatchObject({ id: 's1', model: 'Opus 5.5', contextPercent: 20 })
    // a later input without limits keeps them
    await sleep(20)
    execFileSync('/bin/sh', ['-c', u.command], { input: JSON.stringify({ session_id: 's2' }) })
    expect(u.read()!.limits[0].percent).toBe(30)
    expect(u.read()!.session?.id).toBe('s2')
    t.dispose()
  })

  it('the Windows script writes aside then moves', () => {
    const s = statusLineScript('C:\\Users\\me\\AppData\\ClaudeTerm\\usage', 'win32')
    expect(s).toContain('more > "C:\\Users\\me\\AppData\\ClaudeTerm\\usage\\status.json.tmp"')
    expect(s).toContain('move /y')
  })

  it('asks the usage API with the token of Claude Code, merges its limits, keeps the last ones on failure', async () => {
    const t = new TempDir()
    const calls: [string, Record<string, string>][] = []
    let body: unknown = { limits: [{ kind: 'session', percent: 12 }, { kind: 'weekly_scoped', percent: 64, scope: { model: { display_name: 'Fable' } } }] }
    let creds: any = { accessToken: 'tok', expiresAt: Date.now() + 3600_000, subscriptionType: 'team', rateLimitTier: 'tier_x' }
    const u = new UsageService(join(t.path, 'app'), new ClaudeSettings(join(t.path, 'settings.json')), () => {}, 'darwin', {
      credentials: async () => creds,
      getJson: async (url, headers) => { calls.push([url, headers]); if (body instanceof Error) throw body; return body },
    })
    let s = await u.refresh()
    expect(calls[0]).toEqual(['https://api.anthropic.com/api/oauth/usage', { Authorization: 'Bearer tok', 'anthropic-beta': 'oauth-2025-04-20' }])
    expect(s.snapshot!.limits.map((l) => [l.key, l.percent])).toEqual([['session', 12], ['weekly:Fable', 64]])
    expect(s.plan).toEqual({ subscription: 'team', tier: 'tier_x' })
    expect(s.api?.error).toBeUndefined()
    // persisted: a new service (app restart) shows it before any call
    const again = new UsageService(join(t.path, 'app'), new ClaudeSettings(join(t.path, 'settings.json')), () => {}, 'darwin')
    expect(again.state().snapshot!.limits.map((l) => l.key)).toEqual(['session', 'weekly:Fable'])
    // failures keep the last limits and say why
    body = new Error('API d\'usage : HTTP 500')
    s = await u.refresh()
    expect(s.api?.error).toMatch(/500/)
    expect(s.snapshot!.limits).toHaveLength(2)
    body = { unexpected: true }
    expect((await u.refresh()).api?.error).toMatch(/inattendue/)
    creds = { accessToken: 'old', expiresAt: Date.now() - 1 }
    expect((await u.refresh()).api?.error).toMatch(/expiré/)
    creds = null
    expect((await u.refresh()).api?.error).toMatch(/aucune connexion/)
    t.dispose()
  })
})
