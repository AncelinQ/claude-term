import { useEffect, useState } from 'react'
import type { ThemeSpec } from '@shared/theme'
import { Icons } from './icons'
import { useWorkbench } from '@/stores/workbench'

type Section = 'apparence' | 'terminal' | 'notifications' | 'windows'

/** App settings, shown in the center (⌘,). Claude Code's own settings.json form comes in a later phase. */
export function SettingsPage({ onClose }: { onClose: () => void }) {
  const settings = useWorkbench((s) => s.settings)!
  const [section, setSection] = useState<Section>('apparence')
  const [themes, setThemes] = useState<ThemeSpec[]>([])
  const [hooks, setHooks] = useState<boolean | null>(null)
  const [hookError, setHookError] = useState<string | null>(null)
  useEffect(() => { window.ct.themes.list().then(setThemes); window.ct.claude.hooksInstalled().then(setHooks) }, [])
  const set = (patch: Parameters<typeof window.ct.settings.set>[0]) => window.ct.settings.set(patch)
  const toggleHooks = async (on: boolean) => {
    const r = await window.ct.setHooks(on)
    if (r.ok) { setHooks(on); setHookError(null) } else setHookError(r.error ?? 'erreur')
  }
  const sections: { id: Section; label: string }[] = [
    { id: 'apparence', label: 'Apparence' }, { id: 'terminal', label: 'Terminal' }, { id: 'notifications', label: 'Notifications' },
    ...(window.ct.platform === 'win32' ? [{ id: 'windows' as Section, label: 'Windows' }] : []),
  ]
  return (
    <div className="island grow settings">
      <div className="hdr"><span>Réglages</span><span className="spacer" /><button onClick={onClose} title="Fermer">{Icons.x()}</button></div>
      <div className="content settings-body">
        <div className="settings-nav">
          {sections.map((s) => <button key={s.id} className={section === s.id ? 'on' : ''} onClick={() => setSection(s.id)}>{s.label}</button>)}
        </div>
        <div className="settings-form">
          {section === 'apparence' && (
            <>
              <Row label="Thème" hint="Suivre l'apparence du système, ou fixer un thème.">
                <label className="check"><input type="checkbox" checked={settings.themeFollowSystem} onChange={(e) => set({ themeFollowSystem: e.target.checked })} /> Suivre le système</label>
              </Row>
              {settings.themeFollowSystem ? (
                <>
                  <Row label="Thème sombre"><ThemePicker themes={themes.filter((t) => t.type === 'dark')} value={settings.themeDark} onChange={(v) => set({ themeDark: v })} /></Row>
                  <Row label="Thème clair"><ThemePicker themes={themes.filter((t) => t.type === 'light')} value={settings.themeLight} onChange={(v) => set({ themeLight: v })} /></Row>
                </>
              ) : (
                <Row label="Thème"><ThemePicker themes={themes} value={settings.themeFixed} onChange={(v) => set({ themeFixed: v })} /></Row>
              )}
              <Row label="Thèmes perso" hint={`Dépose un thème VS Code (.json) dans le dossier des thèmes de l'app ; il apparaît ici au prochain lancement.`} />
            </>
          )}
          {section === 'terminal' && (
            <>
              <Row label="Police" hint="Vide = JetBrains Mono, SF Mono, Menlo, Consolas… selon ce qui est installé.">
                <input value={settings.fontFamily} placeholder="par défaut" onChange={(e) => set({ fontFamily: e.target.value })} style={{ width: 220 }} />
              </Row>
              <Row label="Taille">
                <input type="number" min={9} max={24} value={settings.fontSize} onChange={(e) => set({ fontSize: Math.max(9, Math.min(24, +e.target.value || 13)) })} style={{ width: 60 }} /> pt
              </Row>
            </>
          )}
          {section === 'notifications' && (
            <>
              <Row label="Hooks Claude Code" hint="Ajoute deux hooks (Notification, Stop) dans ~/.claude/settings.json qui signalent à ClaudeTerm les permissions en attente, les sessions inactives et les réponses terminées. Fonctionne aussi pour les sessions lancées hors de ClaudeTerm dans un dossier ouvert.">
                <label className="check"><input type="checkbox" checked={hooks === true} disabled={hooks === null} onChange={(e) => toggleHooks(e.target.checked)} /> Installer les hooks</label>
                {hookError && <div className="error">{hookError}</div>}
              </Row>
              <Row label="Notifications système" hint="Quand l'onglet n'est pas visible.">
                <label className="check"><input type="checkbox" checked={settings.notifyOS} onChange={(e) => set({ notifyOS: e.target.checked })} /> Activer</label>
              </Row>
              {window.ct.platform === 'darwin' && (
                <Row label="Badge du Dock">
                  <label className="check"><input type="checkbox" checked={settings.dockBadge} onChange={(e) => set({ dockBadge: e.target.checked })} /> Nombre d'onglets en attente</label>
                </Row>
              )}
            </>
          )}
          {section === 'windows' && (
            <>
              <Row label="Claude Code" hint="Où tourne claude : Windows natif, ou dans une distribution WSL (les shells et ~/.claude suivent).">
                <select value={settings.windowsMode} onChange={(e) => set({ windowsMode: e.target.value as 'native' | 'wsl' })}>
                  <option value="native">Windows natif</option>
                  <option value="wsl">WSL</option>
                </select>
              </Row>
              {settings.windowsMode === 'wsl' && (
                <Row label="Distribution WSL" hint="Vide = distribution par défaut.">
                  <input value={settings.wslDistro} placeholder="Ubuntu" onChange={(e) => set({ wslDistro: e.target.value })} style={{ width: 220 }} />
                </Row>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="srow">
      <div className="slabel">{label}</div>
      <div className="scontrol">{children}{hint && <div className="hint">{hint}</div>}</div>
    </div>
  )
}

function ThemePicker({ themes, value, onChange }: { themes: ThemeSpec[]; value: string; onChange: (id: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
  )
}
