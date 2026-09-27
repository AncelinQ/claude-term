import { useEffect, useState } from 'react'
import type { SkillInfo } from '@shared/ipc'
import { Icons } from '../icons'
import { Island, Empty } from '../Island'
import { useWorkbench } from '@/stores/workbench'

const modeLabel = (s: SkillInfo) => (s.manualOnly || s.isCommand ? 'manuel' : s.autoOnly ? 'auto' : 'auto + /')

/** A list of skills with open / insert / delete; `createIn` (project root or null = personal) enables creation. */
export function SkillsIsland({ title, load, root, createIn, collapsed, onCollapse, grow }: {
  title: string; load: () => Promise<SkillInfo[]>; root: string | null; createIn?: string | null
  collapsed?: boolean; onCollapse?: (c: boolean) => void; grow?: boolean
}) {
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { openFile, insertPrompt, activeProjectId } = useWorkbench()
  const reload = () => load().then(setSkills)
  useEffect(() => { reload() }, [root])
  const create = async () => {
    const r = await window.ct.skills.create(name.trim(), desc.trim(), createIn ?? null)
    if (!r.ok) { setError(r.error ?? 'erreur'); return }
    setCreating(false); setName(''); setDesc(''); setError(null); reload()
    if (r.path && activeProjectId) openFile(activeProjectId, r.path)
  }
  const actions = createIn !== undefined ? <button title="Nouveau skill" onClick={() => setCreating(!creating)}>{Icons.plus()}</button> : undefined
  return (
    <Island title={title} icon={Icons.sparkle(14)} actions={actions} collapsible={!!onCollapse} collapsed={collapsed} onCollapse={onCollapse} grow={grow}>
      {creating && (
        <div className="form">
          <input placeholder="nom (minuscules-tirets)" value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder="description : quand Claude doit l'utiliser" value={desc} onChange={(e) => setDesc(e.target.value)} />
          {error && <div className="error">{error}</div>}
          <div className="row-actions"><button className="btn primary" disabled={!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)} onClick={create}>Créer</button><button className="btn" onClick={() => setCreating(false)}>Annuler</button></div>
        </div>
      )}
      {skills.length === 0 && !creating ? <Empty>{root ? 'Aucun skill. Ils vivent dans .claude/skills/<nom>/SKILL.md.' : 'Aucun skill'}</Empty> : (
        <div className="list">
          {skills.map((s) => (
            <div key={s.path} className="lrow" onDoubleClick={() => activeProjectId && openFile(activeProjectId, s.path)} title={s.path}>
              <span className="ico" style={{ color: 'var(--ct-accent)' }}>{Icons.sparkle(12)}</span>
              <div className="lbody">
                <div className="head"><span className="name">/{s.name}</span><span className="badge dim">{modeLabel(s)}</span>{s.source === 'linked' && <span className="badge dim">lié</span>}</div>
                {s.description && <div className="desc">{s.description}</div>}
              </div>
              <span className="acts">
                {!s.autoOnly && <button title="Insérer /nom dans le prompt" onClick={() => activeProjectId && insertPrompt(activeProjectId, `/${s.name} `)}>{Icons.terminal(12)}</button>}
                {s.source !== 'plugin' && <button title="Supprimer" onClick={async () => { if (confirm(`Supprimer le skill « ${s.name} » ?`)) { await window.ct.skills.remove(s); reload() } }}>{Icons.x(12)}</button>}
              </span>
            </div>
          ))}
        </div>
      )}
    </Island>
  )
}
