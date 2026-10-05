import { useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_REGISTRY } from '@shared/plugin-registry'
import { useUpdate } from '@/stores/update'
import type { UpdateState } from '@shared/update'
import type { ThemeSpec } from '@shared/theme'
import { Icons } from './icons'
import { t } from '@/i18n'
import { useWorkbench } from '@/stores/workbench'
import { installedMonoFonts, installedUiFonts } from './fonts'
import { LOOK_PRESETS, type Look, type Looks } from '@shared/looks'
import { appearanceMode, setAppearance, type AppearanceMode } from '@/appearance'
import { ClaudeCodeSettings } from './ClaudeCodeSettings'
import { ACTIONS, binding, conflicts, defaultBinding, fromEvent, label as keyLabel, type KeyAction } from '@shared/keymap'

type Section = 'general' | 'apparence' | 'editeur' | 'raccourcis' | 'terminal' | 'claude' | 'notifications' | 'plugins' | 'windows'

/** App settings modal: sections on the left, grouped blocks of rows on the right. */
export function SettingsPage({ onClose }: { onClose: () => void }) {
  const settings = useWorkbench((s) => s.settings)!
  const [section, setSection] = useState<Section>('general')
  const update = useUpdate((s) => s.state)
  const [themes, setThemes] = useState<ThemeSpec[]>([])
  const [fonts, setFonts] = useState<string[]>([])
  const [uiFonts, setUiFonts] = useState<string[]>([])
  const [hooks, setHooks] = useState<boolean | null>(null)
  const [hookError, setHookError] = useState<string | null>(null)
  useEffect(() => { window.ct.themes.list().then(setThemes); window.ct.claude.hooksInstalled().then(setHooks); installedMonoFonts().then(setFonts); installedUiFonts().then(setUiFonts) }, [])
  const set = (patch: Parameters<typeof window.ct.settings.set>[0]) => window.ct.settings.set(patch)
  const toggleHooks = async (on: boolean) => {
    const r = await window.ct.setHooks(on)
    if (r.ok) { setHooks(on); setHookError(null) } else setHookError(r.error ?? 'erreur')
  }
  const sections: { id: Section; label: string }[] = [
    { id: 'general', label: t('Général') }, { id: 'apparence', label: t('Apparence') }, { id: 'editeur', label: t('Éditeur') }, { id: 'raccourcis', label: t('Raccourcis') },
    { id: 'terminal', label: t('Terminal') }, { id: 'claude', label: t('Claude Code') }, { id: 'notifications', label: t('Notifications') }, { id: 'plugins', label: t('Plugins') },
    ...(window.ct.platform === 'win32' ? [{ id: 'windows' as Section, label: t('Windows') }] : []),
  ]
  const fontSelect = (value: string, onChange: (v: string) => void, list = fonts) => (
    <select value={list.includes(value) || value === '' ? value : '__custom'} onChange={(e) => onChange(e.target.value === '__custom' ? value : e.target.value)}>
      <option value="">{t('par défaut')}</option>
      {list.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
      {value && !list.includes(value) && <option value="__custom">{value}</option>}
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
            <>
            <Group title={t('Mises à jour')}>
              <Row label={t('Version {v}', { v: update.current ?? '' })} hint={updateText(update)}>
                {update.status === 'ready'
                  ? <button className="btn primary" onClick={() => window.ct.update.install()}>{t('Redémarrer et installer')}</button>
                  : <button className="btn" disabled={update.status === 'unsupported' || update.status === 'checking' || update.status === 'downloading'} onClick={() => window.ct.update.check()}>{update.status === 'checking' ? <span className="spin" /> : t('Rechercher')}</button>}
              </Row>
              <Row label={t('Automatiques')} hint={t('Au démarrage puis toutes les 6 h ; le téléchargement se fait en arrière-plan.')}><Toggle checked={settings.autoUpdate} onChange={(v) => set({ autoUpdate: v })} /></Row>
            </Group>
            <Group title={t('Langue')}>
              <Row label={t('Langue de l\'interface')} hint={t('Système = celle de macOS / Windows.')}>
                <select value={settings.language} onChange={(e) => set({ language: e.target.value as 'system' | 'fr' | 'en' })}>
                  <option value="system">{t('Système')}</option><option value="fr">Français</option><option value="en">English</option>
                </select>
              </Row>
            </Group>
            </>
          )}
          {section === 'apparence' && <Appearance themes={themes} uiFonts={uiFonts} fontSelect={fontSelect} />}
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
                <Row label={t("Reformater à l'enregistrement")} hint={t('Indentation et mise en forme avant chaque écriture (JSON, JS/TS, CSS, HTML…).')}>
                  <Toggle checked={settings.formatOnSave} onChange={(v) => set({ formatOnSave: v })} />
                </Row>
                <Row label={t('Enregistrement automatique')} hint={t("Enregistre les fichiers modifiés quand l'éditeur perd le focus : changement d'onglet, clic dans le terminal, fenêtre en arrière-plan. Désactivé, ⌘S enregistre. Un fichier modifié sur le disque entre-temps n'est jamais écrasé automatiquement.")}>
                  <Toggle checked={settings.autoSave} onChange={(v) => set({ autoSave: v })} />
                </Row>
              </Group>
            </>
          )}
          {section === 'raccourcis' && <Shortcuts Group={Group} Row={Row} />}
          {section === 'terminal' && (
            <>
              <Group title={t('Police')}>
                <Row label={t('Police')}>{fontSelect(settings.fontFamily, (v) => set({ fontFamily: v }))}</Row>
                <Row label={t('Taille')}>{num(settings.fontSize, 9, 24, 'pt', (v) => set({ fontSize: v }))}</Row>
              </Group>
              <Group title={t('Exécuteurs')}>
                <Row label={t('Afficher le terminal au lancement')} hint={t("Un script lancé depuis le panneau Exécuter passe au premier plan. Désactivé, il démarre dans son onglet sans quitter celui où tu es.")}>
                  <Toggle checked={settings.runShow !== false} onChange={(v) => set({ runShow: v })} />
                </Row>
              </Group>
            </>
          )}
          {section === 'claude' && <ClaudeCodeSettings Group={Group} Row={Row} Toggle={Toggle} />}
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
                {window.ct.platform !== 'darwin' && <Row label={t('Barre des tâches')} hint={window.ct.platform === 'win32' ? t("Nombre d'onglets en attente sur l'icône, qui clignote tant que la fenêtre n'est pas au premier plan") : t("L'icône clignote tant que la fenêtre n'est pas au premier plan")}><Toggle checked={settings.dockBadge} onChange={(v) => set({ dockBadge: v })} /></Row>}
              </Group>
            </>
          )}
          {section === 'plugins' && (
            <Group title={t('Catalogue')}>
              <Row label={t('Adresse du catalogue')} hint={t('registry.json listant les plugins installables (https, http://localhost ou file:).')}>
                <input key={settings.pluginRegistry} defaultValue={settings.pluginRegistry} spellCheck={false} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== settings.pluginRegistry) set({ pluginRegistry: v }) }} style={{ width: 320 }} />
              </Row>
              <Row label={t('Catalogue par défaut')}>
                <button className="btn" disabled={settings.pluginRegistry === DEFAULT_REGISTRY} onClick={() => set({ pluginRegistry: DEFAULT_REGISTRY })}>{t('Rétablir')}</button>
              </Row>
            </Group>
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

const ZOOMS = [0.85, 0.9, 1, 1.1, 1.25, 1.5]

/** Mode and theme per mode, the interface colours over the theme, zoom and interface font. */
function Appearance({ themes, uiFonts, fontSelect }: { themes: ThemeSpec[]; uiFonts: string[]; fontSelect: (v: string, onChange: (v: string) => void, list?: string[]) => ReactNode }) {
  const settings = useWorkbench((s) => s.settings)!
  const theme = useWorkbench((s) => s.theme)!
  const set = (patch: Parameters<typeof window.ct.settings.set>[0]) => window.ct.settings.set(patch)
  const mode = appearanceMode(settings, theme)
  const looks: Looks = settings.looks ?? {}
  // a fixed theme of one type stands for that mode's theme
  const themeFor = (type: 'light' | 'dark') => mode === type ? settings.themeFixed : type === 'light' ? settings.themeLight : settings.themeDark
  const pickTheme = (type: 'light' | 'dark', id: string) =>
    set({ ...(type === 'light' ? { themeLight: id } : { themeDark: id }), ...(mode === type ? { themeFixed: id } : {}) })
  const themeSelect = (type: 'light' | 'dark') => {
    const list = themes.filter((x) => x.type === type), value = themeFor(type)
    return (
      <select value={value} onChange={(e) => pickTheme(type, e.target.value)}>
        {list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        {!list.some((x) => x.id === value) && <option value={value}>{value}</option>}
      </select>
    )
  }
  const preset = LOOK_PRESETS.find((p) => JSON.stringify(looks) === JSON.stringify({ light: p.light, dark: p.dark }))
  const custom = !preset && Object.keys(looks).length > 0
  const setLook = (type: 'light' | 'dark', patch: Look) => {
    const next = { ...looks[type], ...patch }
    for (const k of Object.keys(next) as (keyof Look)[]) if (!next[k]) delete next[k]
    const all = { ...looks, [type]: next }
    if (!Object.keys(next).length) delete all[type]
    set({ looks: all })
  }
  // the swatches show the current mode; "Du thème" uses the theme's own colours, not the look's
  const swatch = (key: string, on: boolean, look: Look, name: string, onClick: () => void) => (
    <button key={key} className={'look' + (on ? ' on' : '')} title={name} aria-pressed={on} onClick={onClick}
      style={{ '--look-canvas': look.canvas ?? theme.tokens['window.bg'], '--look-accent': look.accent ?? theme.tokens['accent'] } as React.CSSProperties}><i /></button>
  )
  const colour = (type: 'light' | 'dark', key: keyof Look, label: string) => {
    const fallback = type === theme.type ? theme.tokens[key === 'accent' ? 'accent' : 'window.bg'] : key === 'accent' ? '#808080' : type === 'light' ? '#f0f0f0' : '#202020'
    const v = looks[type]?.[key]
    return (
      <label className="colour" title={label}>
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(v ?? '') ? v : /^#[0-9a-f]{6}$/i.test(fallback ?? '') ? fallback : '#808080'} onChange={(e) => setLook(type, { [key]: e.target.value })} />
        <span className={v ? '' : 'muted'}>{label}</span>
      </label>
    )
  }
  return (
    <>
      <Group title={t('Thème')}>
        <Row label={t('Mode')} hint={t("Système : sombre ou clair selon l'apparence de l'OS.")}>
          <select value={mode} onChange={(e) => setAppearance(e.target.value as AppearanceMode, settings)}>
            <option value="system">{t('Suivre le système')}</option><option value="light">{t('Clair')}</option><option value="dark">{t('Sombre')}</option>
          </select>
        </Row>
        <Row label={t('Thème clair')}>{themeSelect('light')}</Row>
        <Row label={t('Thème sombre')}>{themeSelect('dark')}</Row>
        <Row label={t('Thèmes perso')} hint={t("Dépose un thème VS Code (.json) dans le dossier des thèmes de l'app ; il apparaît ici au prochain lancement.")} />
      </Group>
      <Group title={t("Couleurs de l'interface")}>
        <Row label={t('Teinte')} hint={t("L'accent et le fond de la fenêtre autour des îlots ; les îlots, l'éditeur et le terminal gardent les couleurs du thème.")}>
          <span className="looks">
            {swatch('theme', !preset && !custom, {}, t('Du thème'), () => set({ looks: {} }))}
            {LOOK_PRESETS.map((p) => swatch(p.id, preset?.id === p.id, p[theme.type], t(p.name), () => set({ looks: { light: p.light, dark: p.dark } })))}
          </span>
          <span className="muted">{preset ? t(preset.name) : custom ? t('Personnalisée') : t('Du thème')}</span>
        </Row>
        {(['light', 'dark'] as const).map((type) => (
          <Row key={type} label={type === 'light' ? t('Mode clair') : t('Mode sombre')} hint={type === theme.type ? t('Affiché en ce moment.') : undefined}>
            <span className="unit-row">
              {colour(type, 'accent', t('Accent'))}
              {colour(type, 'canvas', t('Fond'))}
              {looks[type] && <button className="linkbtn" onClick={() => { const all = { ...looks }; delete all[type]; set({ looks: all }) }}>{t('Rétablir')}</button>}
            </span>
          </Row>
        ))}
      </Group>
      <Group title={t('Taille et police')}>
        <Row label={t("Zoom de l'interface")} hint={t("Le texte du terminal et de l'éditeur garde la taille réglée dans leurs sections.")}>
          <select value={settings.uiZoom ?? 1} onChange={(e) => set({ uiZoom: +e.target.value })}>
            {ZOOMS.map((z) => <option key={z} value={z}>{Math.round(z * 100)} %</option>)}
          </select>
        </Row>
        <Row label={t("Police de l'interface")}>{fontSelect(settings.uiFont ?? '', (v) => set({ uiFont: v }), uiFonts)}</Row>
      </Group>
    </>
  )
}


/** Keymap editor: click a shortcut, press the new combination (Escape cancels, Backspace clears). */
function Shortcuts({ Group, Row }: { Group: (p: { title: string; children: ReactNode }) => ReactNode; Row: (p: { label: string; hint?: string; children?: ReactNode }) => ReactNode }) {
  const settings = useWorkbench((s) => s.settings)!
  const kb = settings.keybindings ?? {}
  const preset = settings.keymapPreset ?? 'jetbrains'
  const mac = window.ct.platform === 'darwin'
  const [recording, setRecording] = useState<string | null>(null)
  const cf = conflicts(kb, preset, mac)
  const setKb = (next: Record<string, string>) => window.ct.settings.set({ keybindings: next })
  const onKey = (id: string, e: React.KeyboardEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (e.key === 'Escape') return setRecording(null)
    const combo = e.key === 'Backspace' && !e.metaKey && !e.ctrlKey && !e.altKey ? '' : fromEvent(e.nativeEvent, mac)
    if (combo === null) return
    const def = defaultBinding(ACTIONS.find((a) => a.id === id)!, preset, mac)
    const next = { ...kb }; if (combo === def) delete next[id]; else next[id] = combo
    setKb(next); setRecording(null)
  }
  const group = (scope: KeyAction['scope'], title: string) => (
    <Group title={title}>
      {ACTIONS.filter((a) => a.scope === scope).map((a) => (
        <Row key={a.id} label={t(a.label)} hint={cf[a.id] ? t('En conflit avec : {x}', { x: cf[a.id].map((id) => t(ACTIONS.find((b) => b.id === id)!.label)).join(', ') }) : undefined}>
          <span className="unit-row">
            <button className={'key-recorder' + (recording === a.id ? ' on' : '') + (cf[a.id] ? ' conflict' : '')} onClick={() => setRecording(a.id)} onKeyDown={(e) => recording === a.id && onKey(a.id, e)} onBlur={() => setRecording(null)}>
              {recording === a.id ? t('Appuie sur les touches…') : keyLabel(binding(a.id, kb, preset, mac), mac)}
            </button>
            {kb[a.id] !== undefined && <button className="linkbtn" onClick={() => { const n = { ...kb }; delete n[a.id]; setKb(n) }}>{t('Rétablir')}</button>}
          </span>
        </Row>
      ))}
    </Group>
  )
  return (
    <>
      <div className="cc-bar">
        <select value={preset} onChange={(e) => window.ct.settings.set({ keymapPreset: e.target.value as 'jetbrains' | 'vscode' })}>
          <option value="jetbrains">JetBrains</option><option value="vscode">VS Code</option>
        </select>
        <span className="muted">{t('Clic sur un raccourci puis nouvelle combinaison ; Échap annule, ⌫ efface.')}</span><span className="spacer" />{Object.keys(kb).length > 0 && <button className="btn" onClick={() => setKb({})}>{t('Tout rétablir')}</button>}
      </div>
      {!mac && <div className="cc-bar"><span className="muted">{t('Dans un terminal, Ctrl + lettre reste au shell et à Claude (Ctrl+W efface un mot, Ctrl+R cherche dans l’historique) : seuls les raccourcis avec Maj ou Alt, ou sur une autre touche qu’une lettre, y passent à l’application.')}</span></div>}
      {group('general', t('Général'))}
      {group('editor', t('Éditeur'))}
      {group('terminal', t('Terminal'))}
    </>
  )
}

function updateText(u: UpdateState): string {
  switch (u.status) {
    case 'unsupported': return t('Mises à jour indisponibles : {r}.', { r: u.reason ?? '' })
    case 'checking': return t('Recherche…')
    case 'none': return t('À jour.')
    case 'downloading': return t('Téléchargement de la version {v}… {p} %', { v: u.version ?? '', p: u.progress ?? 0 })
    case 'ready': return t('La version {v} est prête ; elle sera aussi installée à la fermeture de l\'app.', { v: u.version ?? '' })
    case 'error': return t('Échec : {e}', { e: u.error ?? '' })
    default: return t('Depuis les versions publiées sur GitHub.')
  }
}
