import { useEffect, useState, type ReactNode } from 'react'
import type { ThemeSpec } from '@shared/theme'
import { Icons } from './icons'
import { t } from '@/i18n'
import { useWorkbench } from '@/stores/workbench'
import { installedMonoFonts } from './fonts'

type Section = 'general' | 'apparence' | 'editeur' | 'terminal' | 'notifications' | 'windows'

/** App settings modal: sections on the left, grouped blocks of rows on the right. */
export function SettingsPage({ onClose }: { onClose: () => void }) {
  const settings = useWorkbench((s) => s.settings)!
  const [section, setSection] = useState<Section>('general')
  const [themes, setThemes] = useState<ThemeSpec[]>([])
  const [fonts, setFonts] = useState<string[]>([])
  const [hooks, setHooks] = useState<boolean | null>(null)
  const [hookError, setHookError] = useState<string | null>(null)
  useEffect(() => { window.ct.themes.list().then(setThemes); window.ct.claude.hooksInstalled().then(setHooks); installedMonoFonts().then(setFonts) }, [])
  const set = (patch: Parameters<typeof window.ct.settings.set>[0]) => window.ct.settings.set(patch)
  const toggleHooks = async (on: boolean) => {
    const r = await window.ct.setHooks(on)
    if (r.ok) { setHooks(on); setHookError(null) } else setHookError(r.error ?? 'erreur')
  }
  const sections: { id: Section; label: string }[] = [
    { id: 'general', label: t('Général') }, { id: 'apparence', label: t('Apparence') }, { id: 'editeur', label: t('Éditeur') },
    { id: 'terminal', label: t('Terminal') }, { id: 'notifications', label: t('Notifications') },
    ...(window.ct.platform === 'win32' ? [{ id: 'windows' as Section, label: t('Windows') }] : []),
  ]
  const fontSelect = (value: string, onChange: (v: string) => void) => (
    <select value={fonts.includes(value) || value === '' ? value : '__custom'} onChange={(e) => onChange(e.target.value === '__custom' ? value : e.target.value)}>
      <option value="">{t('par défaut')}</option>
      {fonts.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
      {value && !fonts.includes(value) && <option value="__custom">{value}</option>}
    </select>
  )
  const num = (value: number, min: number, max: number, unit: string, onChange: (v: number) => void) => (
    <span className="unit-row"><input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Math.max(min, Math.min(max, +e.target.value || min)))} /><span className="unit">{unit}</span></span>
  )
  return (
    <div className="island grow settings">
      <div className="hdr"><span>{t('Réglages')}</span><span className="spacer" /><button onClick={onClose} title={t('Fermer')}>{Icons.x()}</button></div>
      <div className="content settings-body">
        <div className="settings-nav">
          {sections.map((s) => <button key={s.id} className={section === s.id ? 'on' : ''} onClick={() => setSection(s.id)}>{s.label}</button>)}
        </div>
        <div className="settings-form">
          {section === 'general' && (
            <Group title={t('Langue')}>
              <Row label={t('Langue de l\'interface')} hint={t('Système = celle de macOS / Windows.')}>
                <select value={settings.language} onChange={(e) => set({ language: e.target.value as 'system' | 'fr' | 'en' })}>
                  <option value="system">{t('Système')}</option><option value="fr">Français</option><option value="en">English</option>
                </select>
              </Row>
            </Group>
          )}
          {section === 'apparence' && (
            <Group title={t('Thème')}>
              <Row label={t('Suivre le système')} hint={t("Le thème sombre ou clair suit l'apparence du système.")}>
                <Toggle checked={settings.themeFollowSystem} onChange={(v) => set({ themeFollowSystem: v })} />
              </Row>
              {settings.themeFollowSystem ? (
                <>
                  <Row label={t('Thème sombre')}><ThemePicker themes={themes.filter((x) => x.type === 'dark')} value={settings.themeDark} onChange={(v) => set({ themeDark: v })} /></Row>
                  <Row label={t('Thème clair')}><ThemePicker themes={themes.filter((x) => x.type === 'light')} value={settings.themeLight} onChange={(v) => set({ themeLight: v })} /></Row>
                </>
              ) : (
                <Row label={t('Thème')}><ThemePicker themes={themes} value={settings.themeFixed} onChange={(v) => set({ themeFixed: v })} /></Row>
              )}
              <Row label={t('Thèmes perso')} hint={t("Dépose un thème VS Code (.json) dans le dossier des thèmes de l'app ; il apparaît ici au prochain lancement.")} />
            </Group>
          )}
          {section === 'editeur' && (
            <>
              <Group title={t('Police')}>
                <Row label={t('Police')}>{fontSelect(settings.editorFontFamily, (v) => set({ editorFontFamily: v }))}</Row>
                <Row label={t('Taille')}>{num(settings.editorFontSize, 9, 28, 'pt', (v) => set({ editorFontSize: v }))}</Row>
                <Row label={t('Interligne')} hint={t('0 = automatique.')}>{num(settings.editorLineHeight, 0, 48, 'px', (v) => set({ editorLineHeight: v }))}</Row>
              </Group>
              <Group title={t('Affichage')}>
                <Row label={t('Retour à la ligne')} hint={t('Replier les lignes longues')}><Toggle checked={settings.editorWordWrap} onChange={(v) => set({ editorWordWrap: v })} /></Row>
                <Row label={t('Minimap')}><Toggle checked={settings.editorMinimap} onChange={(v) => set({ editorMinimap: v })} /></Row>
              </Group>
              <Group title={t('Enregistrement')}>
                <Row label={t('Enregistrement automatique')} hint={t("Enregistre les fichiers modifiés quand l'éditeur perd le focus : changement d'onglet, clic dans le terminal, fenêtre en arrière-plan. Désactivé, ⌘S enregistre. Un fichier modifié sur le disque entre-temps n'est jamais écrasé automatiquement.")}>
                  <Toggle checked={settings.autoSave} onChange={(v) => set({ autoSave: v })} />
                </Row>
              </Group>
            </>
          )}
          {section === 'terminal' && (
            <Group title={t('Police')}>
              <Row label={t('Police')}>{fontSelect(settings.fontFamily, (v) => set({ fontFamily: v }))}</Row>
              <Row label={t('Taille')}>{num(settings.fontSize, 9, 24, 'pt', (v) => set({ fontSize: v }))}</Row>
            </Group>
          )}
          {section === 'notifications' && (
            <>
              <Group title={t('Hooks Claude Code')}>
                <Row label={t('Installer les hooks')} hint={t("Ajoute deux hooks (Notification, Stop) dans ~/.claude/settings.json qui signalent à ClaudeTerm les permissions en attente, les sessions inactives et les réponses terminées. Fonctionne aussi pour les sessions lancées hors de ClaudeTerm dans un dossier ouvert.")}>
                  <Toggle checked={hooks === true} disabled={hooks === null} onChange={toggleHooks} />
                  {hookError && <div className="error">{hookError}</div>}
                </Row>
              </Group>
              <Group title={t('Alertes')}>
                <Row label={t('Notifications système')} hint={t("Quand l'onglet n'est pas visible.")}><Toggle checked={settings.notifyOS} onChange={(v) => set({ notifyOS: v })} /></Row>
                {window.ct.platform === 'darwin' && <Row label={t('Badge du Dock')} hint={t("Nombre d'onglets en attente")}><Toggle checked={settings.dockBadge} onChange={(v) => set({ dockBadge: v })} /></Row>}
              </Group>
            </>
          )}
          {section === 'windows' && (
            <Group title={t('Claude Code')}>
              <Row label={t('Environnement')} hint={t('Où tourne claude : Windows natif, ou dans une distribution WSL (les shells et ~/.claude suivent).')}>
                <select value={settings.windowsMode} onChange={(e) => set({ windowsMode: e.target.value as 'native' | 'wsl' })}>
                  <option value="native">{t('Windows natif')}</option><option value="wsl">WSL</option>
                </select>
              </Row>
              {settings.windowsMode === 'wsl' && (
                <Row label={t('Distribution WSL')} hint={t('Vide = distribution par défaut.')}>
                  <input value={settings.wslDistro} placeholder="Ubuntu" onChange={(e) => set({ wslDistro: e.target.value })} style={{ width: 200 }} />
                </Row>
              )}
            </Group>
          )}
        </div>
      </div>
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <div className="sgroup"><div className="sgroup-title">{title}</div><div className="sgroup-body">{children}</div></div>
}

function Row({ label, hint, children }: { label: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="srow">
      <div className="slabel"><div>{label}</div>{hint && <div className="hint">{hint}</div>}</div>
      <div className="scontrol">{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <button className={'toggle' + (checked ? ' on' : '')} disabled={disabled} onClick={() => onChange(!checked)} role="switch" aria-checked={checked}><span /></button>
}

function ThemePicker({ themes, value, onChange }: { themes: ThemeSpec[]; value: string; onChange: (id: string) => void }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)}>{themes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
}
