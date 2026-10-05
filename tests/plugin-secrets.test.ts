import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TempDir } from './helpers'
import { PluginSecrets, type Cipher } from '../src/main/services/plugin-secrets'

// reversible and visibly not the plain text
const cipher = (why: string | null = null): Cipher => ({
  unavailable: () => why,
  encrypt: (t) => Buffer.from([...Buffer.from(t, 'utf8')].map((b) => b ^ 0x5a)),
  decrypt: (d) => Buffer.from([...d].map((b) => b ^ 0x5a)).toString('utf8'),
})

describe('plugin secrets', () => {
  it('keeps each plugin\'s secrets encrypted, in its own file', () => {
    const t = new TempDir()
    const dir = join(t.path, '.secrets')
    const s = new PluginSecrets(dir, cipher())
    expect(s.get('acme.linear', 'apiKey')).toBeUndefined()
    s.set('acme.linear', 'apiKey', 'lin_api_ABC')
    s.set('acme.other', 'apiKey', 'other')
    expect(s.get('acme.linear', 'apiKey')).toBe('lin_api_ABC')
    expect(s.get('acme.other', 'apiKey')).toBe('other')
    expect(readFileSync(join(dir, 'acme.linear.json'), 'utf8')).not.toContain('lin_api_ABC')
    s.set('acme.linear', 'apiKey', 'lin_api_NEW')
    expect(s.get('acme.linear', 'apiKey')).toBe('lin_api_NEW')
    s.delete('acme.linear', 'apiKey')
    s.delete('acme.linear', 'missing')
    expect(s.get('acme.linear', 'apiKey')).toBeUndefined()
    expect(existsSync(join(dir, 'acme.linear.json'))).toBe(false)
    s.clear('acme.other')
    expect(s.get('acme.other', 'apiKey')).toBeUndefined()
    t.dispose()
  })

  it('checks names and values, and refuses to store without the system encryption', () => {
    const t = new TempDir()
    const s = new PluginSecrets(t.path, cipher())
    for (const k of ['', '../x', 'a/b', 'x'.repeat(65), 3, undefined]) expect(() => s.set('p', k, 'v'), String(k)).toThrow(/secret name/)
    expect(() => s.set('p', 'k', 1)).toThrow(/string value/)
    expect(() => s.set('p', 'k', 'x'.repeat(16 * 1024 + 1))).toThrow(/too large/)
    s.set('p', 'k', 'v')
    const locked = new PluginSecrets(t.path, cipher('secrets: no system keyring'))
    expect(() => locked.set('p', 'k2', 'v')).toThrow(/no system keyring/)
    expect(() => locked.get('p', 'k')).toThrow(/no system keyring/)
    expect(locked.get('p', 'absent')).toBeUndefined()
    t.write('broken.json', '{')
    expect(s.get('broken', 'k')).toBeUndefined()
    t.dispose()
  })
})
