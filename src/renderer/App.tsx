import { useEffect } from 'react'
import { useWorkbench, useActiveProject, isClaude } from './stores/workbench'
import { applyTheme } from './theme/apply'
import { Icons } from './workbench/icons'
import { LeftActivityBar, RightActivityBar } from './workbench/ActivityBar'
import { LeftSidebar, RightSidebar } from './workbench/Sidebars'
import { Center } from './workbench/Center'
import { Welcome } from './workbench/Welcome'

export function App() {
  const { theme, settings, projects, activeProjectId, init, setActiveProject, newProject, closeProject, newTab, closeTab } = useWorkbench()
  const project = useActiveProject()
  useEffect(() => { init() }, [])
  useEffect(() => { if (theme) applyTheme(theme) }, [theme])

  // shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const p = useWorkbench.getState().projects.find((x) => x.id === useWorkbench.getState().activeProjectId)
      if (e.key === 't' && !e.shiftKey && p?.root) { e.preventDefault(); newTab(p.id, 'shell') }
      else if (e.key === 't' && e.shiftKey && p?.root) { e.preventDefault(); newTab(p.id, 'claude') }
      else if (e.key === 'w' && !e.shiftKey && p?.currentTabId) { e.preventDefault(); closeTab(p.id, p.currentTabId) }
      else if (e.key === 'n' && !e.shiftKey) { e.preventDefault(); newProject(null) }
      else if (e.key === 'o' && !e.shiftKey) { e.preventDefault(); window.ct.app.pickFolder().then((d) => { if (d) { const s = useWorkbench.getState(); const target = p && !p.root ? p : s.newProject(null); s.setRoot(target.id, d) } }) }
      else if (['1', '2', '3', '4', '5', '6'].includes(e.key) && !e.altKey) { e.preventDefault(); const ids = ['explorer', 'search', 'scripts', 'skills', 'mcp', 'plugins'] as const; const id = ids[+e.key - 1]; useWorkbench.getState().setLeft(useWorkbench.getState().leftActivity === id ? null : id) }
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
            <span>{p.root ? p.root.split(/[\\/]/).filter(Boolean).pop() : 'Nouveau projet'}</span>
            <button className="close" onClick={(e) => { e.stopPropagation(); closeProject(p.id) }} title="Fermer le projet (⇧⌘W)">{Icons.x(10)}</button>
          </div>
        ))}
        <button className="plus" title="Nouveau projet (⌘N)" onClick={() => newProject(null)} style={{ width: 24, height: 24, display: 'grid', placeItems: 'center', borderRadius: 12, color: 'var(--ct-text-secondary)' }}>{Icons.plus(12)}</button>
        <span className="spacer" />
        <button className="gear" title="Réglages (⌘,)">{Icons.gear(16)}</button>
      </div>
      <div className="body">
        {project.root && <LeftActivityBar />}
        {project.root && <LeftSidebar project={project} />}
        {project.root ? <Center project={project} /> : <Welcome project={project} />}
        <RightSidebar />
        <RightActivityBar />
      </div>
      <StatusBar />
    </div>
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
      {tab && <span className="item">{isClaude(tab) ? Icons.sparkle(12) : Icons.terminal(12)} {short(tab.cwd)}</span>}
      {tab && isClaude(tab) && tab.session?.permissionMode && <span className="badge" style={{ background: 'var(--ct-accent-bg)', color: 'var(--ct-accent)' }}>{tab.session.permissionMode}</span>}
      {tab && isClaude(tab) && tab.session?.planMode && <span className="badge" style={{ background: 'var(--ct-accent-bg)', color: 'var(--ct-accent)' }}>plan</span>}
      {tab && !isClaude(tab) && tab.busy && <span className="item"><span className="spin" /> <span style={{ color: 'var(--ct-text-tertiary)' }}>{tab.lastCommand}</span></span>}
      {tab && !isClaude(tab) && !tab.busy && tab.lastExit !== null && (
        <span className="item">
          <span className="badge" style={{ background: tab.lastExit === 0 ? 'color-mix(in srgb, var(--ct-badge-ok) 20%, transparent)' : 'color-mix(in srgb, var(--ct-badge-error) 20%, transparent)', color: tab.lastExit === 0 ? 'var(--ct-badge-ok)' : 'var(--ct-badge-error)' }}>{tab.lastExit === 0 ? 'ok' : 'exit ' + tab.lastExit}</span>
          <span style={{ color: 'var(--ct-text-tertiary)' }}>{tab.lastCommand}</span>
        </span>
      )}
      <span className="spacer" />
      {tab && isClaude(tab) && tab.session && <span className="item muted">{tab.session.inputTokens.toLocaleString()} ↓ {tab.session.outputTokens.toLocaleString()} ↑</span>}
      {tab && <span className="item"><span className="dot" style={{ width: 7, height: 7, borderRadius: 4, background: tab.alive ? 'var(--ct-badge-ok)' : 'var(--ct-badge-error)' }} /> {tab.alive ? 'actif' : 'terminé'}</span>}
    </div>
  )
}
