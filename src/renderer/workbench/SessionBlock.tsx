import { useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { Icons } from './icons'
import { Island, Empty } from './Island'
import { diffStats } from '@shared/claude-format'
import { useWorkbench, sessionTab, type Project, type Tab } from '@/stores/workbench'
import { usePlugins } from '@/stores/plugins'
import { PluginViewBody } from './PluginView'
import { FileIcon } from './FileIcon'
import { Gutter, useStoredSize } from './Split'
import { t } from '@/i18n'

const short = (p: string) => { const h = window.ct.home; return p.startsWith(h) ? '~' + p.slice(h.length) : p }

/** Bottom block of the center: Plan / Activity / Files of the Claude session in front. */
export function SessionBlock({ project, collapsed, onCollapse }: { project: Project; collapsed: boolean; onCollapse: (c: boolean) => void }) {
  const mode = useWorkbench((s) => s.sessionMode)
  const setMode = useWorkbench((s) => s.setSessionMode)
  const plugins = usePlugins((s) => s.plugins)
  const bottomViews = useMemo(() => usePlugins.getState().bottomViews(), [plugins])
  const pluginModel = usePlugins((s) => (mode.includes(':') ? s.views[mode] : undefined))
  useEffect(() => { if (mode.includes(':') && !pluginModel) window.ct.plugins.view(mode).then((m) => { if (m) usePlugins.setState((s) => ({ views: { ...s.views, [mode]: m } })) }) }, [mode, pluginModel])
  const tab = useWorkbench((s) => sessionTab(s, project))
  const session = tab?.session
  // plan mode opens the block on the plan, once per plan file
  const [autoOpened, setAutoOpened] = useState<string | null>(null)
  useEffect(() => {
    if (!session?.planMode) return
    const key = session.planPath ?? 'pending'
    if (key === autoOpened) return
    setAutoOpened(key); setMode('plan'); onCollapse(false)
  }, [session?.planMode, session?.planPath])

  const modeBtn = (m: string, label: string, active: boolean, count = 0) => (
    <button className={'mode' + (mode === m ? ' on' : '')} onClick={() => { setMode(m); onCollapse(false) }}>
      {label}{active ? <span className="live" /> : count > 0 ? <span className="count">{count}</span> : null}
    </button>
  )
  const title = (
    <span className="modes">
      {modeBtn('plan', t('Plan'), !!session?.planMode)}
      {modeBtn('activity', t('Activité'), (session?.runningTools.length ?? 0) > 0)}
      {modeBtn('files', t('Fichiers'), false, Object.keys(session?.files ?? {}).length)}
      {bottomViews.length > 0 && <span className="vsep" />}
      {bottomViews.map((v) => <span key={v.id} style={{ display: 'contents' }}>{modeBtn(v.id, v.title, false)}</span>)}
    </span>
  )
  const actions = tab ? <span className="session-title">{Icons.claude(11)} {tab.title}</span> : null
  return (
    <Island title={title} actions={actions} collapsible collapsed={collapsed} onCollapse={onCollapse}>
      {mode.includes(':') ? (
        <PluginViewBody model={pluginModel} wide layoutKey={mode} send={(type, extra) => window.ct.plugins.event({ viewId: mode, type, ...extra })} />
      ) : !tab || !session ? (
        <Empty>{t('Sélectionne un onglet Claude, ou tape claude dans un shell')}</Empty>
      ) : mode === 'plan' ? <PlanView tab={tab} /> : mode === 'activity' ? <ActivityView tab={tab} /> : <FilesView tab={tab} />}
    </Island>
  )
}

function PlanView({ tab }: { tab: Tab }) {
  const s = tab.session!
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(s.planText || '', { async: false }) as string), [s.planText])
  const boxes = (s.planText.match(/^\s*[-*] \[[ xX]\]/gm) ?? []).length
  const done = (s.planText.match(/^\s*[-*] \[[xX]\]/gm) ?? []).length
  const [plans, setPlans] = useState<{ path: string; title: string }[]>([])
  useEffect(() => { window.ct.claude.plans().then(setPlans) }, [s.planPath])
  if (!s.planPath) {
    return (
      <div className="plan-empty">
        <Empty>{t('Aucun plan lié à cette session')}</Empty>
        {plans.length > 0 && (
          <div className="plan-pick">
            <div className="hint">{t('Lier un plan existant :')}</div>
            {plans.slice(0, 8).map((p) => <button key={p.path} className="linkbtn" onClick={() => window.ct.claude.setPlan(tab.id, p.path)}>{p.title}</button>)}
          </div>
        )}
      </div>
    )
  }
  return (
    <div className="plan">
      <div className="plan-bar">
        {s.planMode && <span className="badge accent">{t('mode plan')}</span>}
        <span className="path" title={s.planPath}>{short(s.planPath)}</span>
        {boxes > 0 && <span className="progress"><span style={{ width: `${(done / boxes) * 100}%` }} /></span>}
        {boxes > 0 && <span className="muted">{done}/{boxes}</span>}
        <span className="spacer" />
        <button className="linkbtn" onClick={() => window.ct.app.openExternal(s.planPath!)}>{t('Ouvrir')}</button>
        <button className="linkbtn" onClick={() => window.ct.claude.setPlan(tab.id, null)}>{t('Détacher')}</button>
      </div>
      <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

function ActivityView({ tab }: { tab: Tab }) {
  const s = tab.session!
  const openFile = useWorkbench((x) => x.openFile)
  const projectId = useWorkbench((x) => x.activeProjectId)!
  const icon = (kind: string) => {
    switch (kind) {
      case 'user': return Icons.terminal(12)
      case 'text': return Icons.claude(12)
      case 'Edit': case 'Write': case 'MultiEdit': case 'NotebookEdit': case 'Edit (bash)': return Icons.file(12)
      case 'Read': return Icons.file(12)
      case 'Bash': return Icons.terminal(12)
      case 'Grep': case 'Glob': case 'WebSearch': return Icons.search(12)
      default: return Icons.activity(12)
    }
  }
  return (
    <div className="activity-list">
      <div className="act-bar">
        {s.runningTools.length > 0 ? <span className="item"><span className="spin" /> {s.runningTools.map((t) => t.name).join(', ')}</span> : <span className="muted">{s.sessionId ? t('en attente') : t('en attente du transcript…')}</span>}
        <span className="spacer" />
        <span className="muted">{s.inputTokens.toLocaleString()} ↓ {s.outputTokens.toLocaleString()} ↑</span>
      </div>
      <div className="events">
        {s.events.length === 0 && <Empty>{t('Rien pour l\'instant')}</Empty>}
        {s.events.map((e) => (
          <div key={e.id} className={'event ' + (e.kind === 'user' ? 'user' : e.kind === 'text' ? 'text' : 'tool')} onDoubleClick={() => e.file && openFile(projectId, e.file)} title={e.file ?? undefined}>
            <span className="ico">{icon(e.kind)}</span>
            {e.kind !== 'user' && e.kind !== 'text' && <span className="kind">{e.kind}</span>}
            <span className="detail">{e.file ? short(e.file) : e.detail}</span>
          </div>
        ))}
        <EndAnchor dep={s.events.length} />
      </div>
    </div>
  )
}

function EndAnchor({ dep }: { dep: number }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  useEffect(() => { el?.scrollIntoView({ block: 'end' }) }, [dep, el])
  return <div ref={setEl} />
}

function FilesView({ tab }: { tab: Tab }) {
  const s = tab.session!
  const openFile = useWorkbench((x) => x.openFile)
  const projectId = useWorkbench((x) => x.activeProjectId)!
  const isModified = (p: string) => !!s.backups[p] || !!s.bashDiffs[p]
  const rows = Object.keys(s.files).sort((a, b) => { const ea = isModified(a), eb = isModified(b); return ea !== eb ? (ea ? -1 : 1) : a.localeCompare(b) })
  const [selected, setSelected] = useState<string | null>(null)
  const current = selected && s.files[selected] !== undefined ? selected : rows.find(isModified) ?? rows[0] ?? null
  const [diff, setDiff] = useState('')
  const [stats, setStats] = useState<Record<string, [number, number]>>({})
  const [listWidth, setListWidth] = useStoredSize('files-list', 280)
  useEffect(() => {
    let live = true
    const load = async () => {
      const out: Record<string, [number, number]> = {}
      for (const p of rows.filter(isModified)) {
        const d = s.backups[p] ? await window.ct.claude.sessionDiff(p, s.backups[p].name, s.sessionId ?? '') : (s.bashDiffs[p] ?? []).join('\n')
        out[p] = diffStats(d)
        if (p === current && live) setDiff(d)
      }
      if (live) setStats(out)
      if (current && !isModified(current) && live) setDiff('')
    }
    load()
    return () => { live = false }
  }, [tab.session, current])
  if (rows.length === 0) return <Empty>{t('Aucun fichier touché pour l\'instant')}</Empty>
  return (
    <div className="files">
      <div className="files-list" style={{ width: listWidth }}>
        {rows.map((p) => (
          <div key={p} className={'frow' + (p === current ? ' sel' : '')} onClick={() => setSelected(p)} onDoubleClick={() => openFile(projectId, p)} title={p}>
            <FileIcon path={p} size={14} />
            <span className="name">{p.split(/[\\/]/).pop()}</span>
            <span className="rel">{short(p).replace(/[^/]*$/, '')}</span>
            {stats[p] && <span className="stat"><b className="add">+{stats[p][0]}</b> <b className="del">−{stats[p][1]}</b></span>}
            {!isModified(p) && s.files[p] > 0 && <span className="muted">{s.files[p]}×</span>}
          </div>
        ))}
      </div>
      <Gutter axis="x" className="inner" onDrag={(d) => setListWidth((w) => Math.max(160, Math.min(700, w + d)))} />
      <div className="diff">
        {current && isModified(current) ? (diff ? diff.split('\n').map((l, i) => <div key={i} className={'dl ' + (l.startsWith('+') && !l.startsWith('+++') ? 'add' : l.startsWith('-') && !l.startsWith('---') ? 'del' : l.startsWith('@@') ? 'hunk' : '')}>{l}</div>) : <Empty>{t('Aucune différence')}</Empty>) : <Empty>{t('Lu, pas modifié dans cette session')}</Empty>}
      </div>
    </div>
  )
}
