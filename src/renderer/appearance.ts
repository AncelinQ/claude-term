import type { Settings } from '@shared/ipc'
import type { ResolvedTheme } from '@shared/theme'
import { t } from '@/i18n'

export type AppearanceMode = 'system' | 'light' | 'dark'

/** Follows the OS, or the fixed theme's type (the current theme is the fixed one then). */
export function appearanceMode(s: Settings, current: ResolvedTheme): AppearanceMode {
  return s.themeFollowSystem ? 'system' : current.type
}

/** Light and dark use the themes chosen for each mode. */
export function setAppearance(mode: AppearanceMode, s: Settings) {
  if (mode === 'system') return window.ct.settings.set({ themeFollowSystem: true })
  return window.ct.settings.set({ themeFollowSystem: false, themeFixed: mode === 'light' ? s.themeLight : s.themeDark })
}

export const NEXT_MODE: Record<AppearanceMode, AppearanceMode> = { system: 'light', light: 'dark', dark: 'system' }

export function modeLabel(m: AppearanceMode): string {
  return m === 'system' ? t('Système') : m === 'light' ? t('Clair') : t('Sombre')
}
