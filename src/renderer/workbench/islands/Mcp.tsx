import { useEffect, useState } from 'react'
import type { MCPServer } from '@shared/ipc'
import { Icons } from '../icons'
import { Island, Empty } from '../Island'
import { useWorkbench } from '@/stores/workbench'

const empty = (): MCPServer => ({ name: '', transport: 'stdio', command: '', args: [], url: '', env: {}, headers: {}, scope: 'project', sourcePath: '', disabled: false })
const summary = (s: MCPServer) => (s.transport === 'stdio' ? [s.command, ...s.args].join(' ') : s.url)

/** MCP servers of the project (.mcp.json, editable) or of the user (`claude mcp`, read + add/remove). */
export function McpIsland({ scope, root, collapsed, onCollapse, grow }: { scope: 'project' | 'user'; root: string | null; collapsed?: boolean; onCollapse?: (c: boolean) => void; grow?: boolean }) {
  const [servers, setServers] = useState<MCPServer[]>([])
  const [health, setHealth] = useState<Record<string, string>>({})
  const [checking, setChecking] = useState(false)
  const [editing, setEditing] = useState<{ s: MCPServer; replacing?: string } | null>(null)
  const [library, setLibrary] = useState<MCPServer[]>([])
  const [error, setError] = useState<string | null>(null)
  const insertPrompt = useWorkbench((s) => s.insertPrompt)
  const activeProjectId = useWorkbench((s) => s.activeProjectId)
  const reload = async () => {
    if (scope === 'project') setServers(root ? [...(await window.ct.mcp.project(root)), ...(await window.ct.mcp.linked(root))] : [])
    else setServers([...(await window.ct.mcp.user()), ...(root ? await window.ct.mcp.local(root) : [])])
  }
  useEffect(() => { reload(); if (scope === 'project') window.ct.mcp.library(root).then(setLibrary) }, [root, scope])
  const check = async () => { setChecking(true); setHealth(await window.ct.mcp.health(root)); setChecking(false) }
  const save = async () => {
    if (!editing) return
    const s = editing.s
    if (scope === 'project' && root) {
      const r = await window.ct.mcp.write(s, root, editing.replacing)
      if (!r.ok) { setError(r.error ?? 'erreur'); return }
    } else {
      const args = ['add', '-s', 'user', '-t', s.transport, ...Object.entries(s.env).flatMap(([k, v]) => ['-e', `${k}=${v}`]), ...Object.entries(s.headers).flatMap(([k, v]) => ['-H', `${k}: ${v}`]), s.name, ...(s.transport === 'stdio' ? ['--', s.command, ...s.args] : [s.url])]
      const r = await window.ct.mcp.cli(args, root)
      if (r.code !== 0) { setError(r.output.trim() || 'erreur'); return }
    }
    setEditing(null); setError(null); reload()
  }
  const remove = async (s: MCPServer) => {
    if (!confirm(`Retirer le serveur « ${s.name} » ?`)) return
    if (s.scope === 'project' && root) await window.ct.mcp.remove(s.name, root)
    else if (s.scope === 'user' || s.scope === 'local') await window.ct.mcp.cli(['remove', '-s', s.scope, s.name], root)
    reload()
  }
  const actions = (
    <>
      <button title="Vérifier l'état" onClick={check}>{checking ? <span className="spin" /> : Icons.activity()}</button>
      {(scope === 'user' || root) && <button title="Ajouter" onClick={() => setEditing({ s: empty() })}>{Icons.plus()}</button>}
    </>
  )
  const dot = (s: MCPServer) => { const h = health[s.name]; return h ? <span className="dot" style={{ background: h === 'connected' ? 'var(--ct-badge-ok)' : h === 'needsAuth' ? 'var(--ct-badge-warn)' : 'var(--ct-badge-error)' }} title={h} /> : null }
  return (
    <Island title={scope === 'project' ? 'MCP du projet' : 'MCP perso'} icon={Icons.plug(14)} actions={actions} collapsible={!!onCollapse} collapsed={collapsed} onCollapse={onCollapse} grow={grow}>
      {editing && (
        <div className="form">
          <div className="row-actions">
            <input placeholder="nom" value={editing.s.name} onChange={(e) => setEditing({ ...editing, s: { ...editing.s, name: e.target.value } })} style={{ flex: 1 }} />
            <select value={editing.s.transport} onChange={(e) => setEditing({ ...editing, s: { ...editing.s, transport: e.target.value as MCPServer['transport'] } })}>
              <option value="stdio">stdio</option><option value="http">http</option><option value="sse">sse</option>
            </select>
          </div>
          {editing.s.transport === 'stdio' ? (
            <input placeholder="commande et arguments (npx -y @x/server …)" value={[editing.s.command, ...editing.s.args].join(' ')} onChange={(e) => { const [c = '', ...a] = e.target.value.split(/\s+/); setEditing({ ...editing, s: { ...editing.s, command: c, args: a.filter(Boolean) } }) }} />
          ) : (
            <input placeholder="https://…/mcp" value={editing.s.url} onChange={(e) => setEditing({ ...editing, s: { ...editing.s, url: e.target.value } })} />
          )}
          <input placeholder={editing.s.transport === 'stdio' ? 'env : KEY=value, autre=…' : 'headers : Authorization=Bearer …'} value={Object.entries(editing.s.transport === 'stdio' ? editing.s.env : editing.s.headers).map(([k, v]) => `${k}=${v}`).join(', ')}
            onChange={(e) => { const o: Record<string, string> = {}; for (const kv of e.target.value.split(',')) { const i = kv.indexOf('='); if (i > 0) o[kv.slice(0, i).trim()] = kv.slice(i + 1).trim() } setEditing({ ...editing, s: editing.s.transport === 'stdio' ? { ...editing.s, env: o } : { ...editing.s, headers: o } }) }} />
          {scope === 'project' && !editing.replacing && library.length > 0 && (
            <div className="plan-pick"><div className="hint">Copier depuis un autre projet :</div>{library.map((l) => <button key={l.sourcePath + l.name} className="linkbtn" onClick={() => setEditing({ s: { ...l, scope: 'project', sourcePath: '' } })}>{l.name}</button>)}</div>
          )}
          {error && <div className="error">{error}</div>}
          <div className="row-actions"><button className="btn primary" disabled={!editing.s.name.trim() || (editing.s.transport === 'stdio' ? !editing.s.command : !editing.s.url)} onClick={save}>{editing.replacing ? 'Enregistrer' : 'Ajouter'}</button><button className="btn" onClick={() => { setEditing(null); setError(null) }}>Annuler</button></div>
        </div>
      )}
      {servers.length === 0 && !editing ? <Empty>{scope === 'project' ? 'Aucun serveur dans .mcp.json' : 'Aucun serveur perso'}</Empty> : (
        <div className="list">
          {servers.map((s) => (
            <div key={s.scope + s.name + s.sourcePath} className="lrow" title={s.sourcePath} style={{ opacity: s.disabled ? 0.5 : 1 }}>
              <span className="ico" style={{ color: 'var(--ct-badge-info)' }}>{Icons.plug(12)}</span>
              <div className="lbody">
                <div className="head">{dot(s)}<span className="name">{s.name}</span><span className="badge dim">{s.transport}</span>{s.scope !== 'project' && s.scope !== 'user' && <span className="badge dim">{s.scope === 'linked' ? 'lié' : s.scope}</span>}{s.disabled && <span className="badge dim">désactivé</span>}</div>
                <div className="desc">{summary(s)}</div>
              </div>
              <span className="acts">
                {health[s.name] === 'needsAuth' && <button title="Ouvrir /mcp dans Claude pour s'authentifier" onClick={() => activeProjectId && insertPrompt(activeProjectId, '/mcp')}>{Icons.terminal(12)}</button>}
                {(s.scope === 'project' || s.scope === 'linked') && <button title="Modifier" onClick={() => setEditing({ s: { ...s }, replacing: s.name })}>{Icons.list(12)}</button>}
                {(s.scope === 'project' || s.scope === 'user' || s.scope === 'local') && <button title="Retirer" onClick={() => remove(s)}>{Icons.x(12)}</button>}
              </span>
            </div>
          ))}
        </div>
      )}
    </Island>
  )
}
