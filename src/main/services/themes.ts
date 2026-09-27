import { app, nativeTheme } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveTheme, type ResolvedTheme, type ThemeSpec } from '@shared/theme'
import type { SettingsService } from './settings'

export const BUILTIN_DARK = 'claudeterm-dark'
export const BUILTIN_LIGHT = 'claudeterm-light'

/** Built-in themes (`resources/themes`) + user themes (`userData/themes`). Follows the OS when asked. */
export class ThemeService {
  private themes: ThemeSpec[] = []
  private listeners = new Set<(t: ResolvedTheme) => void>()
  private last?: ResolvedTheme

  constructor(private settings: SettingsService, private builtinDir: string, private userDir = join(app.getPath('userData'), 'themes')) {
    mkdirSync(userDir, { recursive: true })
    this.reload()
    nativeTheme.on('updated', () => this.apply())
    settings.onChange(() => this.apply())
  }

  reload() {
    this.themes = [...load(this.builtinDir), ...load(this.userDir)]
    this.apply()
  }

  list(): ThemeSpec[] { return this.themes }

  activeId(): string {
    const s = this.settings.get()
    if (!s.themeFollowSystem) return s.themeFixed
    return nativeTheme.shouldUseDarkColors ? s.themeDark : s.themeLight
  }

  current(): ResolvedTheme {
    const id = this.activeId()
    const spec = this.themes.find((t) => t.id === id) ?? this.themes.find((t) => t.id === BUILTIN_DARK) ?? FALLBACK
    const base = this.themes.find((t) => t.id === (spec.type === 'light' ? BUILTIN_LIGHT : BUILTIN_DARK)) ?? FALLBACK
    return resolveTheme(spec, base)
  }

  apply() {
    const t = this.current()
    const s = this.settings.get()
    // native chrome (title bar overlay, dialogs) follows the theme type
    nativeTheme.themeSource = s.themeFollowSystem ? 'system' : t.type
    if (this.last && JSON.stringify(this.last) === JSON.stringify(t)) return
    this.last = t
    this.listeners.forEach((l) => l(t))
  }

  onChange(l: (t: ResolvedTheme) => void) { this.listeners.add(l); return () => this.listeners.delete(l) }
}

function load(dir: string): ThemeSpec[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort().flatMap((f) => {
    try {
      const j = JSON.parse(readFileSync(join(dir, f), 'utf8'))
      if (!j.id) j.id = f.replace(/\.json$/, '')
      if (j.type !== 'light') j.type = 'dark'
      j.colors ??= {}
      return [j as ThemeSpec]
    } catch { return [] }
  })
}

const FALLBACK: ThemeSpec = {
  id: 'fallback', name: 'Fallback', type: 'dark',
  colors: { 'editor.background': '#1e1e1e', 'editor.foreground': '#d4d4d4', 'focusBorder': '#ff9a3c' },
}
