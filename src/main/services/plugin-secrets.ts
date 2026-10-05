import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Electron's safeStorage, or a stand-in for the tests. */
export interface Cipher {
  /** null when the OS offers nothing better than a fixed key (Linux without a keyring): secrets are refused */
  unavailable(): string | null
  encrypt(text: string): Buffer
  decrypt(data: Buffer): string
}

const KEY = /^[A-Za-z0-9_.-]{1,64}$/
const MAX_VALUE = 16 * 1024

/**
 * Each plugin's secrets (ctx.secrets): `<dir>/<pluginId>.json`, a map of name → value encrypted by the OS (Keychain,
 * DPAPI, libsecret), readable only by this user and this app. A plugin reaches its own file only.
 */
export class PluginSecrets {
  constructor(private dir: string, private cipher: Cipher) {}

  get(pluginId: string, key: unknown): string | undefined {
    const name = this.key(key)
    const v = this.read(pluginId)[name]
    if (v === undefined) return undefined
    this.check()
    return this.cipher.decrypt(Buffer.from(v, 'base64'))
  }

  set(pluginId: string, key: unknown, value: unknown) {
    const name = this.key(key)
    if (typeof value !== 'string') throw new Error('secrets.set: string value expected')
    if (value.length > MAX_VALUE) throw new Error('secrets.set: value too large')
    this.check()
    const all = this.read(pluginId)
    all[name] = this.cipher.encrypt(value).toString('base64')
    this.write(pluginId, all)
  }

  delete(pluginId: string, key: unknown) {
    const name = this.key(key)
    const all = this.read(pluginId)
    if (!(name in all)) return
    delete all[name]
    this.write(pluginId, all)
  }

  /** every secret of a plugin (uninstall) */
  clear(pluginId: string) { rmSync(this.file(pluginId), { force: true }) }

  private key(key: unknown): string {
    if (typeof key !== 'string' || !KEY.test(key)) throw new Error('secret name: 1-64 letters, digits, . _ -')
    return key
  }

  private check() { const why = this.cipher.unavailable(); if (why) throw new Error(why) }

  private file(pluginId: string) { return join(this.dir, pluginId + '.json') }

  private read(pluginId: string): Record<string, string> {
    const f = this.file(pluginId)
    if (!existsSync(f)) return {}
    try { const d = JSON.parse(readFileSync(f, 'utf8')); return d && typeof d === 'object' && !Array.isArray(d) ? d : {} } catch { return {} }
  }

  private write(pluginId: string, all: Record<string, string>) {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 })
    if (!Object.keys(all).length) return this.clear(pluginId)
    writeFileSync(this.file(pluginId), JSON.stringify(all, null, 2), { mode: 0o600 })
  }
}
