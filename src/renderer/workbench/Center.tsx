import { Icons } from './icons'
import { TermBubble, attentionColor, attentionLabel } from './TermBubble'
import { useReorder } from './useReorder'
import { TerminalHost } from '@/terminal/TerminalView'
import { useEffect, useState, type CSSProperties, type MouseEvent } from 'react'
import { useWorkbench, isClaude, type Project, type Tab } from '@/stores/workbench'
import { VStack, useCollapsed } from './Split'
import { SessionBlock } from './SessionBlock'
import { Island } from './Island'
import { MenuButton, ContextMenu, type MenuItem } from './Menu'
import { shortcutLabel, withShortcut } from '@/actions'
import { EditorHost, ImageView, DiffHost } from '@/editor/EditorHost'
import { MarkdownPreview } from '@/editor/MarkdownPreview'
import { Gutter, useStoredSize } from './Split'
import { t as tr } from '@/i18n'
import { barItems, GROUP_COLORS, NO_GROUPS, nextColor, type GroupColor, type TabGroup } from '@shared/tab-groups'
import { MODEL_CHOICES } from '@shared/models'

/** A group's colour, from the theme (its terminal colours) */
export const GROUP_VARS: Record<GroupColor, string> = {
  grey: 'var(--ct-text-tertiary)', blue: 'var(--ct-ansi-4)', red: 'var(--ct-ansi-1)', yellow: 'var(--ct-ansi-3)', green: 'var(--ct-ansi-2)',
  pink: 'var(--ct-ansi-13)', purple: 'var(--ct-ansi-5)', cyan: 'var(--ct-ansi-6)', orange: 'var(--ct-badge-warn)',
}
const COLOR_NAMES: Record<GroupColor, string> = { grey: 'Gris', blue: 'Bleu', red: 'Rouge', yellow: 'Jaune', green: 'Vert', pink: 'Rose', purple: 'Violet', cyan: 'Cyan', orange: 'Orange' }
const groupName = (g: TabGroup) => g.name || tr(COLOR_NAMES[g.color])
const dot = (c: GroupColor) => <span className="gdot" style={{ background: GROUP_VARS[c] }} />

/** File state of the current tab, in the island header (terminal tabs show theirs in a floating bubble: TermBubble). */
function TabStatus({ tab }: { tab: Tab }) {
  const { reloadFile, saveFile } = useWorkbench()
  const badge = (text: string, color: string) => <span className="badge" style={{ background: `color-mix(in srgb, ${color} 20%, transparent)`, color }}>{text}</span>
  if (tab.kind === 'file') {
    return (
      <span className="tstatus">
        {tab.error && <span style={{ color: 'var(--ct-badge-error)' }}>{tab.error}</span>}
        {tab.changedOnDisk && <span className="item">{badge(tr('modifié sur le disque'), 'var(--ct-badge-warn)')}<button className="linkbtn" onClick={() => reloadFile(tab.path!)}>{tr('Recharger')}</button></span>}
        {tab.dirty && !tab.changedOnDisk && <button className="linkbtn" onClick={() => saveFile(tab.path!)}>{withShortcut(tr('Enregistrer'), 'app.save')}</button>}
      </span>
    )
  }
  return null
}

function tabColor(t: Tab) {
  if (!t.alive) return 'var(--ct-text-tertiary)'
  if (isClaude(t)) return 'var(--ct-accent)'
  if (t.busy) return 'var(--ct-badge-ok)'
  if (t.lastExit !== null && t.lastExit !== 0) return 'var(--ct-badge-error)'
  return 'var(--ct-badge-info)'
}

/**
 * A group's label: its name (or a colour dot), a click folds it, a double click renames it. Folded: how many tabs it
 * holds and the signs of its Claude tabs (✦ working, a dot when one waits); marked when it holds the tab shown.
 */
function GroupLabel({ group, tabs, current, drag, renaming, onRename, onToggle, onStartRename, onMenu }: {
  group: TabGroup; tabs: Tab[]; current: string | null; drag: ReturnType<typeof useReorder>
  renaming: boolean; onRename: (name: string | null) => void; onToggle: () => void; onStartRename: () => void; onMenu: (e: MouseEvent) => void
}) {
  const id = 'group:' + group.id
  const waiting = tabs.find((t) => t.attention)
  const working = tabs.some((t) => t.working)
  const holdsCurrent = tabs.some((t) => t.id === current)
  return (
    <div {...(renaming ? {} : drag.props(id))} className={'tglabel' + (group.folded && holdsCurrent ? ' on' : '') + drag.dropClass(id)}
      onClick={onToggle} onDoubleClick={(e) => { e.stopPropagation(); onStartRename() }} onContextMenu={onMenu}
      title={group.folded ? tr('{name} : {n} onglet(s), clic pour déplier', { name: groupName(group), n: tabs.length }) : tr('{name} : clic pour replier', { name: groupName(group) })}>
      {renaming ? (
        <input className="tab-rename" autoFocus defaultValue={group.name} placeholder={tr(COLOR_NAMES[group.color])} spellCheck={false} onClick={(e) => e.stopPropagation()}
          onBlur={(e) => onRename(e.currentTarget.dataset.cancel ? null : e.currentTarget.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.dataset.cancel = '1'; e.currentTarget.blur() } }} />
      ) : group.name ? <span className="gname">{group.name}</span> : <span className="gdot" />}
      {group.folded && <span className="gcount">{tabs.length}</span>}
      {group.folded && working && <span className="gsign tab-working" title={tr('Claude travaille')}>✦</span>}
      {group.folded && waiting && <span className="gsign attn-dot" style={{ background: attentionColor(waiting.attention!) }} title={attentionLabel(waiting.attention!)} />}
    </div>
  )
}

export function Center({ project }: { project: Project }) {
  const { newTab, closeTab, closeFiles, setCurrentTab, moveTab, groupTabs, addTabToGroup, removeTabFromGroup, ungroupTabs, updateTabGroup, closeTabGroup, groupTabsByKind } = useWorkbench()
  // a group's label takes what is dropped on it
  const drag = useReorder('tab:' + project.id, (from, to, place) => moveTab(project.id, from, to, place), { holds: (id) => id.startsWith('group:') })
  const [ctx, setCtx] = useState<{ x: number; y: number; tab?: Tab; group?: TabGroup } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const renameTab = useWorkbench((s) => s.renameTab)
  const setMdMode = useWorkbench((s) => s.setMdMode)
  const [splitWidth, setSplitWidth] = useStoredSize('md-split', 50)   // % of the editor area
  const fileCount = project.tabs.filter((t) => t.kind === 'file').length
  const [sessionCollapsed, setSessionCollapsed] = useCollapsed('session')
  const current = project.tabs.find((t) => t.id === project.currentTabId) ?? null
  const groups = project.tabGroups ?? NO_GROUPS
  const items = barItems(project.tabs.map((t) => t.id), groups)
  const byId = new Map(project.tabs.map((t) => [t.id, t]))
  useEffect(() => { document.querySelector('.tabs .tab.on')?.scrollIntoView({ inline: 'nearest', block: 'nearest' }) }, [project.currentTabId])
  const home = window.ct.home
  const short = (p: string) => (p.startsWith(home) ? '~' + p.slice(home.length) : p)

  const tabMenu = (tab: Tab): (MenuItem | 'sep')[] => {
    const mine = groups.members[tab.id]
    return [
      { label: tr('Fermer'), shortcut: shortcutLabel('app.closeTab'), onSelect: () => closeTab(project.id, tab.id) },
      ...(tab.kind !== 'file' && tab.kind !== 'diff' ? [{ label: tr('Renommer…'), onSelect: () => setRenaming(tab.id) }] : []),
      'sep',
      { label: tr('Nouveau groupe'), icon: dot(nextColor(groups)), onSelect: () => groupTabs(project.id, [tab.id]) },
      ...groups.groups.filter((g) => g.id !== mine).map((g) => ({ label: tr('Ajouter au groupe « {name} »', { name: groupName(g) }), icon: dot(g.color), onSelect: () => addTabToGroup(project.id, tab.id, g.id) })),
      ...(mine ? [{ label: tr('Retirer du groupe'), onSelect: () => removeTabFromGroup(project.id, tab.id) }] : []),
      { label: tr('Grouper les onglets Claude'), icon: Icons.claude(13), onSelect: () => groupTabsByKind(project.id, 'claude') },
      { label: tr('Grouper les shells'), icon: Icons.terminal(13), onSelect: () => groupTabsByKind(project.id, 'shell') },
      'sep',
      { label: tr('Fermer les autres fichiers'), disabled: fileCount < (tab.kind === 'file' ? 2 : 1), onSelect: () => closeFiles(project.id, tab.kind === 'file' ? tab.id : undefined) },
      { label: tr('Fermer tous les fichiers'), disabled: fileCount === 0, onSelect: () => closeFiles(project.id) },
      ...(tab.kind === 'file' ? ['sep' as const, { label: tr('Afficher dans le Finder'), onSelect: () => window.ct.app.revealInFinder(tab.path!) }, { label: tr('Copier le chemin'), onSelect: () => navigator.clipboard.writeText(tab.path!) }] : []),
    ]
  }
  const groupMenu = (g: TabGroup): (MenuItem | 'sep')[] => [
    { label: tr('Renommer…'), onSelect: () => setRenaming('group:' + g.id) },
    { label: g.folded ? tr('Déplier') : tr('Replier'), onSelect: () => updateTabGroup(project.id, g.id, { folded: !g.folded }) },
    'sep',
    ...GROUP_COLORS.map((c) => ({ label: tr(COLOR_NAMES[c]) + (c === g.color ? ' ✓' : ''), icon: dot(c), onSelect: () => updateTabGroup(project.id, g.id, { color: c }) })),
    'sep',
    { label: tr('Dégrouper'), onSelect: () => ungroupTabs(project.id, g.id) },
    { label: tr('Fermer le groupe'), danger: true, onSelect: () => closeTabGroup(project.id, g.id) },
  ]

  function renderTab(t: Tab) {
    return (
      <div key={t.id} {...(renaming === t.id ? {} : drag.props(t.id))} className={'tab' + (t.id === project.currentTabId ? ' on' : '') + (t.dirty ? ' dirty' : '') + drag.dropClass(t.id)} onClick={() => setCurrentTab(project.id, t.id)} onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, tab: t }) }} title={t.kind === 'file' ? t.path : t.busy ? t.lastCommand : t.cwd}>
        <span className={t.working ? 'tab-working' : undefined} style={{ color: t.kind === 'file' ? (t.changedOnDisk ? 'var(--ct-badge-warn)' : 'var(--ct-text-secondary)') : tabColor(t), display: 'inline-flex', position: 'relative' }} title={t.attention ? attentionLabel(t.attention) : t.working ? tr('Claude travaille') : undefined}>
          {t.kind === 'diff' ? Icons.columns(12) : t.kind === 'file' ? (t.fileKind === 'image' ? Icons.image(12) : Icons.file(12)) : isClaude(t) ? Icons.claude(12) : Icons.terminal(12)}
          {t.attention && <span className="attn" style={{ background: attentionColor(t.attention) }} />}
        </span>
        {renaming === t.id ? (
          <input className="tab-rename" autoFocus defaultValue={t.customTitle ?? t.title} spellCheck={false} onClick={(e) => e.stopPropagation()} onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => { if (!e.currentTarget.dataset.cancel) renameTab(t.id, e.currentTarget.value); setRenaming(null) }}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.dataset.cancel = '1'; e.currentTarget.blur() } }} />
        ) : (
          <span style={{ fontStyle: t.dirty ? 'italic' : undefined }} onDoubleClick={t.kind !== 'file' && t.kind !== 'diff' ? (e) => { e.stopPropagation(); setRenaming(t.id) } : undefined}>{t.customTitle ?? t.title}</span>
        )}
        <button className={'close' + (t.dirty ? ' dot' : '')} onClick={(e) => { e.stopPropagation(); closeTab(project.id, t.id) }} title={t.dirty ? withShortcut(tr('Modifications non enregistrées'), 'app.save') : withShortcut(tr('Fermer'), 'app.closeTab')}>
          {t.dirty ? <span className="dirty-dot" /> : Icons.x(10)}
        </button>
      </div>
    )
  }

  const body = current && current.kind === 'diff' ? <div className="term-wrap editor-bg"><DiffHost key={current.id} tab={current} /></div>
    : current && current.kind === 'file' ? (
      current.error ? <div className="term-wrap"><div className="empty">{current.error}</div></div>
      : current.fileKind === 'image' ? <div className="term-wrap"><ImageView src={current.imageUrl ?? ''} /></div>
      : /\.(md|markdown)$/i.test(current.path ?? '') ? (
        <div className="term-wrap editor-bg md-host">
          <div className={'md-panes mode-' + (current.mdMode ?? 'code')}>
            {(current.mdMode ?? 'code') !== 'preview' && <div className="md-pane" style={{ flex: current.mdMode === 'split' ? `0 0 ${splitWidth}%` : '1' }}><EditorHost tab={current} /></div>}
            {current.mdMode === 'split' && <Gutter axis="x" className="inner" size={splitWidth} onSize={setSplitWidth} min={20} max={80} reset={50} scale={() => 100 / (document.querySelector('.md-panes')?.clientWidth || 1000)} />}
            {(current.mdMode ?? 'code') !== 'code' && <div className="md-pane"><MarkdownPreview path={current.path!} /></div>}
          </div>
          <div className="md-modes">
            {(['code', 'split', 'preview'] as const).map((m) => (
              <button key={m} className={(current.mdMode ?? 'code') === m ? 'on' : ''} title={m === 'code' ? tr('Code') : m === 'split' ? tr('Côte à côte') : tr('Rendu')} onClick={() => setMdMode(current.id, m)}>
                {m === 'code' ? Icons.code(13) : m === 'split' ? Icons.columns(13) : Icons.eye(13)}
              </button>
            ))}
          </div>
        </div>
      ) : <div className="term-wrap editor-bg"><EditorHost tab={current} /></div>
    ) : current ? (
      <div className="term-stack"><TerminalHost key={current.id} tab={current} /><TermBubble tab={current} /></div>
    ) : (
      <div className="term-wrap">
        <div className="welcome">
          <div>
            <div style={{ color: 'var(--ct-text-tertiary)' }}>{Icons.terminalBox(40)}</div>
            <h1>{tr('Aucune session')}</h1>
            <p>{short(project.selectedFolder)}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn primary" onClick={() => newTab(project.id, 'claude')}>{Icons.claude(14)} Démarrer Claude</button>
              <button className="btn" onClick={() => newTab(project.id, 'shell')}>{Icons.terminal(14)} Shell</button>
            </div>
          </div>
        </div>
      </div>
    )

  return (
    <div className="center">
      <ContextMenu at={ctx} onClose={() => setCtx(null)} items={ctx?.tab ? tabMenu(ctx.tab) : ctx?.group ? groupMenu(ctx.group) : []} />
      <VStack id="session" collapsed={sessionCollapsed} initial={240} min={120}
        top={<Island grow title={
            <div className="tabs">
              {items.map((it) => ('tab' in it ? renderTab(byId.get(it.tab)!) : (
                <div key={it.group.id} className={'tgroup' + (it.group.folded ? ' folded' : '')} style={{ '--gcolor': GROUP_VARS[it.group.color] } as CSSProperties}>
                  <GroupLabel group={it.group} tabs={it.tabs.map((id) => byId.get(id)!)} current={project.currentTabId} drag={drag}
                    renaming={renaming === 'group:' + it.group.id} onRename={(name) => { if (name !== null) updateTabGroup(project.id, it.group.id, { name: name.trim().slice(0, 40) }); setRenaming(null) }}
                    onToggle={() => updateTabGroup(project.id, it.group.id, { folded: !it.group.folded })} onStartRename={() => setRenaming('group:' + it.group.id)}
                    onMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, group: it.group }) }} />
                  {!it.group.folded && it.tabs.map((id) => renderTab(byId.get(id)!))}
                </div>
              )))}
            </div>}
          actions={<>
            {current?.kind === 'file' && <TabStatus tab={current} />}
            <MenuButton title={tr('Nouvel onglet')} items={[
              { label: tr('Claude'), icon: Icons.claude(13), shortcut: shortcutLabel('app.newClaude'), onSelect: () => newTab(project.id, 'claude') },
              { label: tr('Shell'), icon: Icons.terminal(13), shortcut: shortcutLabel('app.newShell'), onSelect: () => newTab(project.id, 'shell') },
              'sep',
              // a Claude tab on another model than the default, for its sessions only (claude --model)
              ...MODEL_CHOICES.map((c) => ({ label: tr('Claude avec {model}', { model: c.label }), icon: Icons.claude(13), onSelect: () => newTab(project.id, 'claude', undefined, undefined, { model: c.alias }) })),
              ...(window.ct.platform !== 'linux' ? ['sep' as const, { label: tr("Capture d'écran → prompt"), icon: Icons.camera(13), shortcut: shortcutLabel('app.screenshot'), onSelect: () => useWorkbench.getState().captureScreen(project.id) }] : []),
            ]}>{Icons.plus()}</MenuButton>
          </>}>
          {body}
        </Island>}
        bottom={<SessionBlock project={project} collapsed={sessionCollapsed} onCollapse={setSessionCollapsed} />}
      />
    </div>
  )
}
