import { Icons } from './icons'
import { Island, Empty } from './Island'
import { TerminalHost, disposeTerminal } from '@/terminal/TerminalView'
import { useWorkbench, type Project } from '@/stores/workbench'
import { VStack } from './Split'

export function Center({ project }: { project: Project }) {
  const { newTab, closeTab, setCurrentTab, sessionCollapsed, toggleSession } = useWorkbench()
  const current = project.tabs.find((t) => t.id === project.currentTabId) ?? null
  const home = window.ct.home
  const short = (p: string) => (p.startsWith(home) ? '~' + p.slice(home.length) : p)
  return (
    <div className="center">
      <VStack id="session" collapsed={sessionCollapsed} initial={240} min={120}
        top={<div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="tabs">
          {project.tabs.map((t) => (
            <div key={t.id} className={'tab' + (t.id === project.currentTabId ? ' on' : '')} onClick={() => setCurrentTab(project.id, t.id)} title={t.cwd}>
              <span style={{ color: t.alive ? (t.kind === 'claude' ? 'var(--ct-accent)' : 'var(--ct-badge-info)') : 'var(--ct-text-tertiary)', display: 'inline-flex' }}>
                {t.kind === 'claude' ? Icons.sparkle(12) : Icons.terminal(12)}
              </span>
              <span>{t.title.replace(/^✳ /, '')}</span>
              <button className="close" onClick={(e) => { e.stopPropagation(); disposeTerminal(t.id); closeTab(project.id, t.id) }} title="Fermer (⌘W)">{Icons.x(10)}</button>
            </div>
          ))}
          <button className="plus" title="Nouvel onglet shell (⌘T)" onClick={() => newTab(project.id, 'shell')}>{Icons.plus(14)}</button>
          <button className="plus" title="Nouvel onglet Claude (⇧⌘T)" onClick={() => newTab(project.id, 'claude')} style={{ color: 'var(--ct-accent)' }}>{Icons.sparkle(14)}</button>
        </div>
        {current ? (
          <TerminalHost key={current.id} tab={current} />
        ) : (
          <div className="term-wrap">
            <div className="welcome">
              <div>
                <div style={{ color: 'var(--ct-accent)' }}>{Icons.sparkle(36)}</div>
                <h1>Aucune session</h1>
                <p>{short(project.selectedFolder)}</p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <button className="btn primary" onClick={() => newTab(project.id, 'claude')}>{Icons.sparkle(14)} Démarrer Claude</button>
                  <button className="btn" onClick={() => newTab(project.id, 'shell')}>{Icons.terminal(14)} Shell</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>}
        bottom={<Island title="Session" icon={Icons.activity(14)} collapsible collapsed={sessionCollapsed} onCollapse={toggleSession}>
          <Empty>Phase 2 : plan, activité et fichiers de la session Claude</Empty>
        </Island>}
      />
    </div>
  )
}
