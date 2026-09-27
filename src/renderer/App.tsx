import { useEffect, useState } from 'react'
import { useWorkbench, useActiveProject, isClaude } from './stores/workbench'
import { applyTheme } from './theme/apply'
import { Icons } from './workbench/icons'
import { LeftActivityBar, RightActivityBar } from './workbench/ActivityBar'
import { LeftSidebar, RightSidebar } from './workbench/Sidebars'
import { Center } from './workbench/Center'
import { Welcome } from './workbench/Welcome'
import { SettingsPage } from './workbench/SettingsPage'
import { setLanguage } from './i18n'
import { usePlugins } from './stores/plugins'
import { PluginPopover } from './workbench/PluginView'
import { t } from '@/i18n'

export function App() {
  const { theme, settings, projects, activeProjectId, init, setActiveProject, newProject, closeProject, newTab, closeTab, showSettings, setShowSettings } = useWorkbench()
  const project = useActiveProject()
  const [prompt, setPrompt] = useState<import('@shared/plugins').PromptRequest | null>(null)
  const popovers = usePlugins((s) => s.popovers)
  const closePopover = usePlugins((s) => s.closePopover)
  useEffect(() => {
    init()
    usePlugins.getState().init()
    window.ct.plugins.onRun((r) => { const s = useWorkbench.getState(); if (s.activeProjectId) s.runCommand(s.activeProjectId, r.cwd, r.command, r.tab) })
    window.ct.plugins.onNotify((n) => { new Notification(n.title, { body: n.body }) })
    window.ct.plugins.onOpenFile((path) => { const s = useWorkbench.getState(); if (s.activeProjectId) s.openFile(s.activeProjectId, path) })
    window.ct.plugins.onPrompt((r) => setPrompt(r))
    window.ct.plugins.onOpenDiff((r) => { const s = useWorkbench.getState(); if (s.activeProjectId) s.openDiff(s.activeProjectId, r) })
    if (import.meta.env.DEV || window.ct.debug) (window as any).__ct = useWorkbench
    if (import.meta.env.DEV || window.ct.debug) (window as any).__ct_state = () => {
      const s = useWorkbench.getState()
      return { activeProjectId: s.activeProjectId, leftActivity: s.leftActivity, rightActivity: s.rightActivity, showSettings: s.showSettings, sessionMode: s.sessionMode,
        projects: s.projects.map((p) => ({ id: p.id, root: p.root, currentTabId: p.currentTabId, selectedPath: p.selectedPath, tabs: p.tabs.map((t) => ({ id: t.id, kind: t.kind, title: t.title, cwd: t.cwd, alive: t.alive, busy: t.busy, lastCommand: t.lastCommand, lastExit: t.lastExit, claudeRunning: t.claudeRunning, attention: t.attention, path: t.path, dirty: t.dirty, changedOnDisk: t.changedOnDisk, session: t.session && { id: t.session.sessionId, events: t.session.events.length, files: Object.keys(t.session.files).length, planMode: t.session.planMode, tokens: [t.session.inputTokens, t.session.outputTokens] } })) })) }
    }
  }, [])
  useEffect(() => { if (theme) applyTheme(theme) }, [theme])
  const activeRoot = project?.root ?? null
  useEffect(() => { window.ct.plugins.projectChanged(activeRoot) }, [activeRoot])
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
      else if (e.key === 's' && e.altKey && p?.root) { e.preventDefault(); st.captureScreen(p.id) }
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
        <div className="ptabs">
        {projects.map((p) => (
          <div key={p.id} className={'ptab' + (p.id === activeProjectId ? ' on' : '')} onClick={() => setActiveProject(p.id)}>
            <span style={{ display: 'inline-flex', color: p.id === activeProjectId ? 'var(--ct-accent)' : undefined }}>{Icons.folder(12)}</span>
            <span>{p.root ? p.root.split(/[\\/]/).filter(Boolean).pop() : t('Nouveau projet')}</span>
            {p.tabs.some((t) => t.attention) && <span className="pcount attn">{p.tabs.filter((t) => t.attention).length}</span>}
            {!p.tabs.some((t) => t.attention) && p.tabs.some((t) => t.alive && (t.busy || isClaude(t))) && <span className="pcount busy">{p.tabs.filter((t) => t.alive && (t.busy || isClaude(t))).length}</span>}
            <button className="close" onClick={(e) => { e.stopPropagation(); closeProject(p.id) }} title={t('Fermer le projet (⇧⌘W)')}>{Icons.x(10)}</button>
          </div>
        ))}
        <button className="plus" title={t('Nouveau projet (⌘N)')} onClick={() => newProject(null)} style={{ width: 24, height: 24, display: 'grid', placeItems: 'center', borderRadius: 5, color: 'var(--ct-text-secondary)' }}>{Icons.plus(12)}</button>
        </div>
      </div>
      <div className="body">
        {project.root && <LeftActivityBar />}
        {project.root && <LeftSidebar project={project} />}
        {project.root ? <Center project={project} /> : <Welcome project={project} />}
        <RightSidebar />
        <RightActivityBar />
      </div>
      {popovers.map((p) => <PluginPopover key={p.id} id={p.id} anchorViewId={p.anchorViewId} model={p.model} onClose={() => closePopover(p.id)} />)}
      {prompt && <PromptModal req={prompt} onDone={(v) => { window.ct.plugins.promptReply(prompt.id, v); setPrompt(null) }} />}
      {showSettings && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowSettings(false) }}>
          <div className="modal"><SettingsPage onClose={() => setShowSettings(false)} /></div>
        </div>
      )}
    </div>
  )
}

/** Themed text prompt used by plugins (ctx.ui.prompt). */
function PromptModal({ req, onDone }: { req: import('@shared/plugins').PromptRequest; onDone: (v: string | null) => void }) {
  const [value, setValue] = useState('')
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onDone(null) }}>
      <div className="modal prompt">
        <div className="island">
          <div className="hdr"><span>{req.title}</span></div>
          <div className="content" style={{ padding: 12, gap: 10 }}>
            <input autoFocus list={req.options ? 'prompt-options' : undefined} placeholder={req.placeholder} value={value} onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onDone(value); if (e.key === 'Escape') { e.stopPropagation(); onDone(null) } }} />
            {req.options && <datalist id="prompt-options">{req.options.map((o) => <option key={o} value={o} />)}</datalist>}
            {req.options && req.options.length > 0 && (
              <div className="plan-pick" style={{ padding: 0 }}>{req.options.slice(0, 12).map((o) => <button key={o} className="linkbtn" onClick={() => onDone(o)}>{o}</button>)}</div>
            )}
            <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => onDone(null)}>{t('Annuler')}</button>
              <button className="btn primary" disabled={!value.trim()} onClick={() => onDone(value)}>OK</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
