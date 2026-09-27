import { useEffect, useState } from 'react'
import type { ThemeSpec } from '@shared/theme'
import { Icons } from './icons'
import { useWorkbench } from '@/stores/workbench'
import { t } from '@/i18n'

type Section = 'general' | 'apparence' | 'editeur' | 'terminal' | 'notifications' | 'windows'

/** App settings, shown in the center (⌘,). Claude Code's own settings.json form comes in a later phase. */
export function SettingsPage({ onClose }: { onClose: () => void }) {
  const settings = useWorkbench((s) => s.settings)!
  const [section, setSection] = useState<Section>('general')
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
    { id: 'general', label: t('Général') }, { id: 'apparence', label: t('Apparence') }, { id: 'editeur', label: t('Éditeur') }, { id: 'terminal', label: t('Terminal') }, { id: 'notifications', label: t('Notifications') },
    ...(window.ct.platform === 'win32' ? [{ id: 'windows' as Section, label: t('Windows') }] : []),
  ]
  return (
    <div className="island grow settings">
      <div className="hdr"><span>{t('Réglages')}</span><span className="spacer" /><button onClick={onClose} title={t('Fermer')}>{Icons.x()}</button></div>
      <div className="content settings-body">
        <div className="settings-nav">
          {sections.map((s) => <button key={s.id} className={section === s.id ? 'on' : ''} onClick={() => setSection(s.id)}>{s.label}</button>)}
        </div>
        <div className="settings-form">
          {section === 'general' && (
            <Row label={t('Langue')} hint={t("Langue de l'interface. Système = celle de macOS / Windows.")}>
              <select value={settings.language} onChange={(e) => set({ language: e.target.value as 'system' | 'fr' | 'en' })}>
                <option value="system">{t('Système')}</option><option value="fr">Français</option><option value="en">English</option>
              </select>
            </Row>
          )}
          {section === 'apparence' && (
            <>
              <Row label={t('Thème')} hint={t('Suivre l\'apparence du système, ou fixer un thème.')}>
                <label className="check"><input type="checkbox" checked={settings.themeFollowSystem} onChange={(e) => set({ themeFollowSystem: e.target.checked })} /> {t('Suivre le système')}</label>
              </Row>
              {settings.themeFollowSystem ? (
                <>
                  <Row label={t('Thème sombre')}><ThemePicker themes={themes.filter((t) => t.type === 'dark')} value={settings.themeDark} onChange={(v) => set({ themeDark: v })} /></Row>
                  <Row label={t('Thème clair')}><ThemePicker themes={themes.filter((t) => t.type === 'light')} value={settings.themeLight} onChange={(v) => set({ themeLight: v })} /></Row>
                </>
              ) : (
                <Row label={t('Thème')}><ThemePicker themes={themes} value={settings.themeFixed} onChange={(v) => set({ themeFixed: v })} /></Row>
              )}
              <Row label={t('Thèmes perso')} hint={`Dépose un thème VS Code (.json) dans le dossier des thèmes de l'app ; il apparaît ici au prochain lancement.`} />
            </>
          )}
          {section === 'editeur' && (
            <>
              <Row label={t('Enregistrement automatique')} hint={t('Écrit le fichier après une pause de frappe. Désactivé, ⌘S enregistre. Un fichier modifié sur le disque entre-temps n\'est jamais écrasé automatiquement.')}>
                <label className="check"><input type="checkbox" checked={settings.autoSave} onChange={(e) => set({ autoSave: e.target.checked })} /> {t('Activer')}</label>
              </Row>
              <Row label={t('Police')} hint={t('Vide = police mono par défaut (JetBrains Mono, SF Mono, Menlo, Consolas…).')}>
                <input value={settings.editorFontFamily} placeholder={t('par défaut')} onChange={(e) => set({ editorFontFamily: e.target.value })} style={{ width: 220 }} />
              </Row>
              <Row label={t('Taille')}>
                <span className="unit-row"><input type="number" min={9} max={28} value={settings.editorFontSize} onChange={(e) => set({ editorFontSize: Math.max(9, Math.min(28, +e.target.value || 13)) })} style={{ width: 60 }} /><span className="unit">pt</span></span>
              </Row>
              <Row label={t('Interligne')} hint={t('0 = automatique.')}>
                <span className="unit-row"><input type="number" min={0} max={48} value={settings.editorLineHeight} onChange={(e) => set({ editorLineHeight: Math.max(0, Math.min(48, +e.target.value || 0)) })} style={{ width: 60 }} /><span className="unit">px</span></span>
              </Row>
              <Row label={t('Retour à la ligne')}>
                <label className="check"><input type="checkbox" checked={settings.editorWordWrap} onChange={(e) => set({ editorWordWrap: e.target.checked })} /> {t('Replier les lignes longues')}</label>
              </Row>
              <Row label={t('Minimap')}>
                <label className="check"><input type="checkbox" checked={settings.editorMinimap} onChange={(e) => set({ editorMinimap: e.target.checked })} /> {t('Afficher la minimap')}</label>
              </Row>
            </>
          )}
          {section === 'terminal' && (
            <>
              <Row label={t('Police')} hint={t('Vide = JetBrains Mono, SF Mono, Menlo, Consolas… selon ce qui est installé.')}>
                <input value={settings.fontFamily} placeholder={t('par défaut')} onChange={(e) => set({ fontFamily: e.target.value })} style={{ width: 220 }} />
              </Row>
              <Row label={t('Taille')}>
                <span className="unit-row"><input type="number" min={9} max={24} value={settings.fontSize} onChange={(e) => set({ fontSize: Math.max(9, Math.min(24, +e.target.value || 13)) })} style={{ width: 60 }} /><span className="unit">pt</span></span>
              </Row>
            </>
          )}
          {section === 'notifications' && (
            <>
              <Row label={t('Hooks Claude Code')} hint={t('Ajoute deux hooks (Notification, Stop) dans ~/.claude/settings.json qui signalent à ClaudeTerm les permissions en attente, les sessions inactives et les réponses terminées. Fonctionne aussi pour les sessions lancées hors de ClaudeTerm dans un dossier ouvert.')}>
                <label className="check"><input type="checkbox" checked={hooks === true} disabled={hooks === null} onChange={(e) => toggleHooks(e.target.checked)} /> {t('Installer les hooks')}</label>
                {hookError && <div className="error">{hookError}</div>}
              </Row>
              <Row label={t('Notifications système')} hint={t('Quand l\'onglet n\'est pas visible.')}>
                <label className="check"><input type="checkbox" checked={settings.notifyOS} onChange={(e) => set({ notifyOS: e.target.checked })} /> {t('Activer')}</label>
              </Row>
              {window.ct.platform === 'darwin' && (
                <Row label={t('Badge du Dock')}>
                  <label className="check"><input type="checkbox" checked={settings.dockBadge} onChange={(e) => set({ dockBadge: e.target.checked })} /> {t('Nombre d\'onglets en attente')}</label>
                </Row>
              )}
            </>
          )}
          {section === 'windows' && (
            <>
              <Row label={t('Claude Code')} hint={t('Où tourne claude : Windows natif, ou dans une distribution WSL (les shells et ~/.claude suivent).')}>
                <select value={settings.windowsMode} onChange={(e) => set({ windowsMode: e.target.value as 'native' | 'wsl' })}>
                  <option value="native">{t('Windows natif')}</option>
                  <option value="wsl">{t('WSL')}</option>
                </select>
              </Row>
              {settings.windowsMode === 'wsl' && (
                <Row label={t('Distribution WSL')} hint={t('Vide = distribution par défaut.')}>
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
