import { useEffect, useState } from 'react'
import type { SessionInfo } from '@shared/ipc'
import { formatCost, showsCost, type Cost } from '@shared/costs'
import { Icons } from '../icons'
import { Island, Empty } from '../Island'
import { useWorkbench, useActiveProject } from '@/stores/workbench'
import { t } from '@/i18n'

const bytes = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} ko`)

/** Past Claude sessions (this project or all), resume in a new Claude tab, open the transcript, delete. */
export function HistoryIsland({ scope }: { scope: 'project' | 'all' }) {
  const project = useActiveProject()
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [q, setQ] = useState('')
  const { newTab, openFile } = useWorkbench()
  const root = project?.root ?? null
  const reload = () => (scope === 'project' && root ? window.ct.claude.sessions(root) : window.ct.claude.allSessions()).then(setSessions)
  useEffect(() => { reload() }, [scope, root, project?.tabs.length])
  // each session's cost (Claude Code's figure, or an estimate)
  const [costs, setCosts] = useState<Record<string, Cost>>({})
  useEffect(() => { window.ct.claude.costs().then((r) => setCosts(r.sessions)) }, [scope])
  const home = window.ct.home
  const short = (p: string) => (p.startsWith(home) ? '~' + p.slice(home.length) : p)
  const fmt = (ms: number) => { const d = new Date(ms); return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) }
  const shown = sessions.filter((s) => !q || s.title.toLowerCase().includes(q.toLowerCase()) || s.projectPath.toLowerCase().includes(q.toLowerCase()))
  const resume = (s: SessionInfo) => project && newTab(project.id, 'claude', s.projectPath || undefined, s.id)
  // the words also searched in what was said (prompts and answers), from 3 characters
  const [said, setSaid] = useState<{ session: SessionInfo; hits: { role: string; snippet: string }[] }[] | null>(null)
  useEffect(() => {
    if (q.trim().length < 3) { setSaid(null); return }
    let live = true
    const timer = setTimeout(() => window.ct.claude.searchText(q).then((r) => {
      if (!live) return
      const inScope = scope === 'project' && root ? r.filter((x) => x.session.projectPath === root || x.session.projectPath.startsWith(root + '/') || x.session.projectPath.startsWith(root + '\\')) : r
      setSaid(inScope)
    }), 350)
    return () => { live = false; clearTimeout(timer) }
  }, [q, scope, root])
  return (
    <Island title={scope === 'project' ? t('Historique du projet') : t('Historique')} icon={Icons.clock(14)} grow>
      <div className="search"><input placeholder={t('filtrer, ou chercher dans les échanges…')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {shown.length === 0 && !said?.length ? <Empty>{said === null && q.trim().length >= 3 ? t('Recherche dans les échanges…') : t('Aucune session')}</Empty> : (
        <div className="list">
          {shown.map((s) => (
            <div key={s.path} className="lrow" title={s.path} onDoubleClick={() => resume(s)}>
              <span className="ico">{Icons.claude(12)}</span>
              <div className="lbody">
                <div className="head"><span className="name">{s.title}</span></div>
                <div className="desc">{fmt(s.modified)}{showsCost(costs[s.path]) ? ` · ${formatCost(costs[s.path])}` : ''}{s.messageCount ? ` · ${s.messageCount} msg` : ''}{s.gitBranch ? ` · ${s.gitBranch}` : ''}{scope === 'all' && s.projectPath ? ` · ${short(s.projectPath)}` : ''}</div>
              </div>
              <span className="acts">
                <button title={t('Reprendre dans un onglet Claude')} onClick={() => resume(s)}>{Icons.terminal(12)}</button>
                <button title={t('Ouvrir le transcript')} onClick={() => project && openFile(project.id, s.path)}>{Icons.file(12)}</button>
                <button title={t('Supprimer (corbeille)')} onClick={async () => {
                  const size = await window.ct.claude.sessionSize(s)
                  if (confirm(t('Supprimer la session « {title} » ({size}) ? Le transcript, ses sous-agents et les sauvegardes de fichiers de Claude Code vont à la corbeille.', { title: s.title, size: bytes(size) }))) { await window.ct.claude.deleteSession(s); reload() }
                }}>{Icons.x(12)}</button>
              </span>
            </div>
          ))}
          {said && said.length > 0 && <>
            <div className="group-title muted">{t('Dans les échanges')} · {said.length}</div>
            {said.map(({ session: s, hits }) => (
              <div key={'said:' + s.path} className="lrow" title={s.path} onDoubleClick={() => resume(s)}>
                <span className="ico">{Icons.search(12)}</span>
                <div className="lbody">
                  <div className="head"><span className="name">{s.title}</span><span className="badge dim">{fmt(s.modified)}</span></div>
                  {hits.map((h, i) => <div key={i} className="desc said">{h.role === 'user' ? '› ' : '✳ '}{h.snippet}</div>)}
                </div>
                <span className="acts">
                  <button title={t('Reprendre dans un onglet Claude')} onClick={() => resume(s)}>{Icons.terminal(12)}</button>
                  <button title={t('Ouvrir le transcript')} onClick={() => project && openFile(project.id, s.path)}>{Icons.file(12)}</button>
                </span>
              </div>
            ))}
          </>}
        </div>
      )}
    </Island>
  )
}
