import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { DEFAULT_SETTINGS, type Settings } from '@shared/ipc'

/** `userData/settings.json`. Unknown keys are preserved; unreadable JSON is never overwritten. */
export class SettingsService {
  private data: Settings & Record<string, unknown> = { ...DEFAULT_SETTINGS }
  private readable = true
  private listeners = new Set<(s: Settings) => void>()
  readonly file: string

  constructor(dir = app.getPath('userData')) {
    mkdirSync(dir, { recursive: true })
    this.file = join(dir, 'settings.json')
    if (existsSync(this.file)) {
      try {
        this.data = { ...DEFAULT_SETTINGS, ...JSON.parse(readFileSync(this.file, 'utf8')) }
      } catch {
        this.readable = false
      }
    } else {
      // first launch: import the native v1's recents and open projects (macOS preferences)
      this.data.recentProjects = readV1Array('recentProjects')
      this.data.openProjects = readV1Array('openProjects')
    }
  }

  get(): Settings { return { ...this.data } }

  set(patch: Partial<Settings>): Settings {
    Object.assign(this.data, patch)
    if (this.readable) writeFileSync(this.file, JSON.stringify(this.data, null, 2) + '\n')
    const s = this.get()
    this.listeners.forEach((l) => l(s))
    return s
  }

  onChange(l: (s: Settings) => void) { this.listeners.add(l); return () => this.listeners.delete(l) }
}

/** Reads a string array from the Swift v1 preferences (`fr.jerome.claudeterm`). */
function readV1Array(key: string): string[] {
  if (process.platform !== 'darwin') return []
  try {
    const out = execFileSync('defaults', ['read', 'fr.jerome.claudeterm', key], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return [...out.matchAll(/"([^"]+)"|^\s+([^",\s][^,]*?),?$/gm)].map((m) => (m[1] ?? m[2]).trim()).filter((p) => p.startsWith('/') && existsSync(p))
  } catch { return [] }
}
