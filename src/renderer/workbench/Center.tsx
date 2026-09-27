import { Icons } from './icons'
import { TerminalHost, disposeTerminal } from '@/terminal/TerminalView'
import { useEffect } from 'react'
import { useWorkbench, isClaude, type Project, type Tab } from '@/stores/workbench'
import { VStack, useCollapsed } from './Split'
import { SessionBlock } from './SessionBlock'
import { Island } from './Island'
import { MenuButton } from './Menu'
import { EditorHost, ImageView } from '@/editor/EditorHost'

export function attentionColor(a: { kind: string }) {
  return a.kind === 'permission' ? 'var(--ct-accent)' : a.kind === 'idle' ? 'var(--ct-badge-warn)' : 'var(--ct-badge-info)'
}
export function attentionLabel(a: { kind: string; message: string }) {
  return a.kind === 'permission' ? (a.message || 'Permission en attente') : a.kind === 'idle' ? 'Claude attend une réponse' : 'Claude a terminé'
}

function tabColor(t: Tab) {
  if (!t.alive) return 'var(--ct-text-tertiary)'
  if (isClaude(t)) return 'var(--ct-accent)'
  if (t.busy) return 'var(--ct-badge-ok)'
  if (t.lastExit !== null && t.lastExit !== 0) return 'var(--ct-badge-error)'
  return 'var(--ct-badge-info)'
}

export function Center({ project }: { project: Project }) {
  const { newTab, closeTab, setCurrentTab } = useWorkbench()
  const [sessionCollapsed, setSessionCollapsed] = useCollapsed('session')
  const current = project.tabs.find((t) => t.id === project.currentTabId) ?? null
  useEffect(() => { document.querySelector('.tabs .tab.on')?.scrollIntoView({ inline: 'nearest', block: 'nearest' }) }, [project.currentTabId])
  const home = window.ct.home
  const short = (p: string) => (p.startsWith(home) ? '~' + p.slice(home.length) : p)
  return (
    <div className="center">
      <VStack id="session" collapsed={sessionCollapsed} initial={240} min={120}
        top={<Island grow title={
            <div className="tabs">
              {project.tabs.map((t) => (
                <div key={t.id} className={'tab' + (t.id === project.currentTabId ? ' on' : '') + (t.dirty ? ' dirty' : '')} onClick={() => setCurrentTab(project.id, t.id)} title={t.kind === 'file' ? t.path : t.busy ? t.lastCommand : t.cwd}>
                  <span style={{ color: t.kind === 'file' ? (t.changedOnDisk ? 'var(--ct-badge-warn)' : 'var(--ct-text-secondary)') : tabColor(t), display: 'inline-flex', position: 'relative' }} title={t.attention ? attentionLabel(t.attention) : undefined}>
                    {t.kind === 'file' ? (t.fileKind === 'image' ? Icons.image(12) : Icons.file(12)) : isClaude(t) ? Icons.sparkle(12) : Icons.terminal(12)}
                    {t.attention && <span className="attn" style={{ background: attentionColor(t.attention) }} />}
                  </span>
                  <span style={{ fontStyle: t.dirty ? 'italic' : undefined }}>{t.title}</span>
                  <button className={'close' + (t.dirty ? ' dot' : '')} onClick={(e) => { e.stopPropagation(); if (t.kind !== 'file') disposeTerminal(t.id); closeTab(project.id, t.id) }} title={t.dirty ? 'Modifications non enregistrées (⌘S)' : 'Fermer (⌘W)'}>
                    {t.dirty ? <span className="dirty-dot" /> : Icons.x(10)}
                  </button>
                </div>
              ))}
            </div>}
          actions={
            <MenuButton title="Nouvel onglet" items={[
              { label: 'Claude', icon: <span style={{ color: 'var(--ct-accent)', display: 'inline-flex' }}>{Icons.sparkle(13)}</span>, shortcut: '⇧⌘T', onSelect: () => newTab(project.id, 'claude') },
              { label: 'Shell', icon: Icons.terminal(13), shortcut: '⌘T', onSelect: () => newTab(project.id, 'shell') },
            ]}>{Icons.plus()}</MenuButton>}>
          {current && current.kind === 'file' ? (
            current.error ? <div className="term-wrap"><div className="empty">{current.error}</div></div>
            : current.fileKind === 'image' ? <div className="term-wrap"><ImageView src={current.imageUrl ?? ''} /></div>
            : <div className="term-wrap editor-bg"><EditorHost tab={current} /></div>
          ) : current ? (
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
        </Island>}
        bottom={<SessionBlock project={project} collapsed={sessionCollapsed} onCollapse={setSessionCollapsed} />}
      />
    </div>
  )
}
