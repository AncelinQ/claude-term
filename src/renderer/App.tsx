import { useEffect } from 'react'
import { useWorkbench, useActiveProject, isClaude } from './stores/workbench'
import { applyTheme } from './theme/apply'
import { Icons } from './workbench/icons'
import { LeftActivityBar, RightActivityBar } from './workbench/ActivityBar'
import { LeftSidebar, RightSidebar } from './workbench/Sidebars'
import { Center, attentionColor, attentionLabel } from './workbench/Center'
import { Welcome } from './workbench/Welcome'
import { SettingsPage } from './workbench/SettingsPage'
import { setLanguage } from './i18n'
import { t } from '@/i18n'

export function App() {
  const { theme, settings, projects, activeProjectId, init, setActiveProject, newProject, closeProject, newTab, closeTab, showSettings, setShowSettings } = useWorkbench()
  const project = useActiveProject()
  useEffect(() => {
    init()
    if (import.meta.env.DEV) (window as any).__ct = useWorkbench
    if (import.meta.env.DEV) (window as any).__ct_state = () => {
      const s = useWorkbench.getState()
      return { activeProjectId: s.activeProjectId, leftActivity: s.leftActivity, rightActivity: s.rightActivity, showSettings: s.showSettings, sessionMode: s.sessionMode,
        projects: s.projects.map((p) => ({ id: p.id, root: p.root, currentTabId: p.currentTabId, selectedPath: p.selectedPath, tabs: p.tabs.map((t) => ({ id: t.id, kind: t.kind, title: t.title, cwd: t.cwd, alive: t.alive, busy: t.busy, lastCommand: t.lastCommand, lastExit: t.lastExit, claudeRunning: t.claudeRunning, attention: t.attention, path: t.path, dirty: t.dirty, changedOnDisk: t.changedOnDisk, session: t.session && { id: t.session.sessionId, events: t.session.events.length, files: Object.keys(t.session.files).length, planMode: t.session.planMode, tokens: [t.session.inputTokens, t.session.outputTokens] } })) })) }
    }
  }, [])
  useEffect(() => { if (theme) applyTheme(theme) }, [theme])
  const language = settings?.language ?? 'system'
  setLanguage(language)
  useEffect(() => { setLanguage(language) }, [language])

  // shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useWorkbench.getState()
      if (e.key === 'Escape' && st.showSettings) { st.setShowSettings(false); return }
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const p = st.projects.find((x) => x.id === st.activeProjectId)
      if (e.key === 't' && !e.shiftKey && p?.root) { e.preventDefault(); newTab(p.id, 'shell') }
      else if (e.key === 't' && e.shiftKey && p?.root) { e.preventDefault(); newTab(p.id, 'claude') }
      else if (e.key === 'w' && !e.shiftKey && st.showSettings) { e.preventDefault(); st.setShowSettings(false) }
      else if (e.key === 'w' && !e.shiftKey && p?.currentTabId) { e.preventDefault(); closeTab(p.id, p.currentTabId) }
      else if (e.key === 'n' && !e.shiftKey) { e.preventDefault(); newProject(null) }
      else if (e.key === 's' && !e.shiftKey) { e.preventDefault(); st.saveCurrentFile() }
      else if (e.key === ',') { e.preventDefault(); st.setShowSettings(!st.showSettings) }
      else if (e.key === 'o' && !e.shiftKey) { e.preventDefault(); window.ct.app.pickFolder().then((d) => { if (d) { const s = useWorkbench.getState(); const target = p && !p.root ? p : s.newProject(null); s.setRoot(target.id, d) } }) }
      else if (['1', '2', '3', '4', '5', '6'].includes(e.key) && !e.altKey) { e.preventDefault(); const ids = ['explorer', 'search', 'history', 'skills', 'mcp', 'plugins'] as const; const id = ids[+e.key - 1]; st.setLeft(st.leftActivity === id ? null : id) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!theme || !settings || !project) return null
  const mac = window.ct.platform === 'darwin'
  return (
    <div className="wb">
      <div className={'title ' + (mac ? 'mac' : 'win')}>
        {projects.map((p) => (
          <div key={p.id} className={'ptab' + (p.id === activeProjectId ? ' on' : '')} onClick={() => setActiveProject(p.id)}>
            <span style={{ display: 'inline-flex', color: p.id === activeProjectId ? 'var(--ct-accent)' : undefined }}>{Icons.folder(12)}</span>
            <span>{p.root ? p.root.split(/[\\/]/).filter(Boolean).pop() : t('Nouveau projet')}</span>
            {p.tabs.some((t) => t.attention) && <span className="pcount attn">{p.tabs.filter((t) => t.attention).length}</span>}
            {!p.tabs.some((t) => t.attention) && p.tabs.some((t) => t.alive && (t.busy || isClaude(t))) && <span className="pcount busy">{p.tabs.filter((t) => t.alive && (t.busy || isClaude(t))).length}</span>}
            <button className="close" onClick={(e) => { e.stopPropagation(); closeProject(p.id) }} title={t('Fermer le projet (⇧⌘W)')}>{Icons.x(10)}</button>
          </div>
        ))}
        <button className="plus" title={t('Nouveau projet (⌘N)')} onClick={() => newProject(null)} style={{ width: 24, height: 24, display: 'grid', placeItems: 'center', borderRadius: 12, color: 'var(--ct-text-secondary)' }}>{Icons.plus(12)}</button>
        <span className="spacer" />
        <button className={'gear' + (showSettings ? ' on' : '')} title={t('Réglages (⌘,)')} onClick={() => setShowSettings(!showSettings)}>{Icons.gear(16)}</button>
      </div>
      <div className="body">
        {project.root && <LeftActivityBar />}
        {project.root && <LeftSidebar project={project} />}
        {project.root ? <Center project={project} /> : <Welcome project={project} />}
        <RightSidebar />
        <RightActivityBar />
      </div>
      <StatusBar />
      {showSettings && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowSettings(false) }}>
          <div className="modal"><SettingsPage onClose={() => setShowSettings(false)} /></div>
        </div>
      )}
    </div>
  )
}

function FileStatus({ tab }: { tab: import('./stores/workbench').Tab }) {
  const reload = useWorkbench((s) => s.reloadFile)
  const save = useWorkbench((s) => s.saveCurrentFile)
  const home = window.ct.home
  const short = (p: string) => (p.startsWith(home) ? '~' + p.slice(home.length) : p)
  return (
    <>
      <span className="item">{Icons.file(12)} {short(tab.path!)}</span>
      {tab.dirty && <span className="badge" style={{ background: 'var(--ct-tab-active-bg)', color: 'var(--ct-text)' }}>{t('modifié')}</span>}
      {tab.changedOnDisk && <span className="item"><span className="badge" style={{ background: 'color-mix(in srgb, var(--ct-badge-warn) 20%, transparent)', color: 'var(--ct-badge-warn)' }}>{t('modifié sur le disque')}</span><button className="linkbtn" onClick={() => reload(tab.path!)}>{t('Recharger')}</button></span>}
      {tab.error && <span className="item" style={{ color: 'var(--ct-badge-error)' }}>{tab.error}</span>}
      {tab.dirty && <button className="linkbtn" onClick={() => save()}>{t('Enregistrer (⌘S)')}</button>}
    </>
  )
}

function StatusBar() {
  const project = useActiveProject()
  const tab = project?.tabs.find((t) => t.id === project.currentTabId)
  const home = window.ct.home
  const short = (p: string) => (p.startsWith(home) ? '~' + p.slice(home.length) : p)
  return (
    <div className="status">
      {project?.root && <span className="item">{Icons.folder(12)} {short(project.root)}</span>}
      {tab && tab.kind === 'file' && <FileStatus tab={tab} />}
      {tab && tab.kind !== 'file' && <span className="item">{isClaude(tab) ? Icons.sparkle(12) : Icons.terminal(12)} {short(tab.cwd)}</span>}
      {tab && tab.attention && <span className="badge" style={{ background: `color-mix(in srgb, ${attentionColor(tab.attention)} 20%, transparent)`, color: attentionColor(tab.attention) }}>{attentionLabel(tab.attention)}</span>}
      {tab && isClaude(tab) && tab.session?.permissionMode && <span className="badge" style={{ background: 'var(--ct-accent-bg)', color: 'var(--ct-accent)' }}>{tab.session.permissionMode}</span>}
      {tab && isClaude(tab) && tab.session?.planMode && <span className="badge" style={{ background: 'var(--ct-accent-bg)', color: 'var(--ct-accent)' }}>{t('plan')}</span>}
      {tab && !isClaude(tab) && tab.busy && <span className="item"><span className="spin" /> <span style={{ color: 'var(--ct-text-tertiary)' }}>{tab.lastCommand}</span></span>}
      {tab && !isClaude(tab) && !tab.busy && tab.lastExit !== null && (
        <span className="item">
          <span className="badge" style={{ background: tab.lastExit === 0 ? 'color-mix(in srgb, var(--ct-badge-ok) 20%, transparent)' : 'color-mix(in srgb, var(--ct-badge-error) 20%, transparent)', color: tab.lastExit === 0 ? 'var(--ct-badge-ok)' : 'var(--ct-badge-error)' }}>{tab.lastExit === 0 ? 'ok' : 'exit ' + tab.lastExit}</span>
          <span style={{ color: 'var(--ct-text-tertiary)' }}>{tab.lastCommand}</span>
        </span>
      )}
      <span className="spacer" />
      {tab && isClaude(tab) && tab.session && <span className="item muted">{tab.session.inputTokens.toLocaleString()} ↓ {tab.session.outputTokens.toLocaleString()} ↑</span>}
      {tab && tab.kind !== 'file' && <span className="item"><span className="dot" style={{ width: 7, height: 7, borderRadius: 4, background: tab.alive ? 'var(--ct-badge-ok)' : 'var(--ct-badge-error)' }} /> {tab.alive ? t('actif') : t('terminé')}</span>}
    </div>
  )
}
