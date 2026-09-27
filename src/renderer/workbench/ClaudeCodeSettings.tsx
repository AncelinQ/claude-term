import { useEffect, useState, type ReactNode } from 'react'
import { t } from '@/i18n'
import { Icons } from './icons'
import { useWorkbench } from '@/stores/workbench'
import { getPath, setPath, hookEntries, addHook, removeHook, setHookCommand, setHookMatcher, setHookEvent, HOOK_EVENTS, MODELS, EFFORTS, PERMISSION_MODES, type Json } from '@shared/claude-settings-model'

/** Form over ~/.claude/settings.json: explicit save, unknown keys preserved, unreadable file never overwritten. */
export function ClaudeCodeSettings({ Group, Row, Toggle }: {
  Group: (p: { title: string; children: ReactNode }) => ReactNode
  Row: (p: { label: string; hint?: string; children?: ReactNode }) => ReactNode
  Toggle: (p: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => ReactNode
}) {
  const [root, setRoot] = useState<Json | null>(null)
  const [saved, setSaved] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [path, setPathStr] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const { openFile, activeProjectId, setShowSettings } = useWorkbench()
  const load = async () => {
    const r = await window.ct.claudeSettings.read()
    setPathStr(r.path)
    if (r.ok) { setRoot(r.data); setSaved(JSON.stringify(r.data)); setError(null) } else { setRoot(null); setError(r.error) }
  }
  useEffect(() => { load() }, [])
  if (error) return <div className="error" style={{ padding: 12 }}>{error}</div>
  if (!root) return null
  const dirty = JSON.stringify(root) !== saved
  const str = (p: string) => (getPath(root, p) as string | undefined) ?? ''
  const bool = (p: string, def = false) => (getPath(root, p) as boolean | undefined) ?? def
  const list = (p: string) => (getPath(root, p) as string[] | undefined) ?? []
  const dict = (p: string) => (getPath(root, p) as Record<string, string> | undefined) ?? {}
  const set = (p: string, v: unknown) => { setRoot(setPath(root, p, v)); setStatus(null) }
  const save = async () => {
    const r = await window.ct.claudeSettings.write(root)
    if (r.ok) { setSaved(JSON.stringify(root)); setStatus(t('Enregistré')) } else setStatus(r.error ?? 'erreur')
  }
  const select = (p: string, options: string[]) => (
    <select value={str(p)} onChange={(e) => set(p, e.target.value || undefined)}>
      {options.map((o) => <option key={o} value={o}>{o || t('par défaut')}</option>)}
    </select>
  )
  const hooks = hookEntries(root)
  return (
    <>
      <div className="cc-bar">
        <span className="muted">{path.replace(window.ct.home, '~')}</span>
        <span className="spacer" />
        {status && <span className="muted">{status}</span>}
        <button className="linkbtn" onClick={() => { if (activeProjectId) { openFile(activeProjectId, path); setShowSettings(false) } }}>{t("Ouvrir dans l'éditeur")}</button>
        <button className="btn" disabled={!dirty} onClick={load}>{t('Annuler')}</button>
        <button className="btn primary" disabled={!dirty} onClick={save}>{t('Enregistrer')}</button>
      </div>
      <Group title={t('Général')}>
        <Row label={t('Modèle')}>{select('model', MODELS)}</Row>
        <Row label={t('Effort')}>{select('effortLevel', EFFORTS)}</Row>
        <Row label={t('Interface')}>{select('tui', ['', 'fullscreen', 'inline'])}</Row>
        <Row label={t('Langue des réponses')} hint={t('ex. français')}><input value={str('language')} onChange={(e) => set('language', e.target.value || undefined)} style={{ width: 160 }} /></Row>
        <Row label={t('Réflexion étendue toujours active')}><Toggle checked={bool('alwaysThinkingEnabled')} onChange={(v) => set('alwaysThinkingEnabled', v || undefined)} /></Row>
        <Row label={t('Co-Authored-By dans les commits')}><Toggle checked={bool('includeCoAuthoredBy', true)} onChange={(v) => set('includeCoAuthoredBy', v ? undefined : false)} /></Row>
        <Row label={t('Purge des transcripts')} hint={t('Jours de conservation des sessions.')}>
          <span className="unit-row"><input type="number" min={1} max={365} value={(getPath(root, 'cleanupPeriodDays') as number | undefined) ?? 30} onChange={(e) => { const v = Math.max(1, Math.min(365, +e.target.value || 30)); set('cleanupPeriodDays', v === 30 ? undefined : v) }} /><span className="unit">j</span></span>
        </Row>
        <Row label={t('Status line')} hint={t('Commande qui produit la ligne de statut de Claude Code.')}><input value={str('statusLine.command')} placeholder={t('commande')} onChange={(e) => set('statusLine.command', e.target.value || undefined)} style={{ width: 260 }} /></Row>
      </Group>
      <Group title={t('Permissions')}>
        <Row label={t('Mode par défaut')}>{select('permissions.defaultMode', PERMISSION_MODES)}</Row>
        <ListRow label={t('Autorisées')} placeholder="Bash(npm run:*)" items={list('permissions.allow')} onChange={(v) => set('permissions.allow', v.length ? v : undefined)} />
        <ListRow label={t('À confirmer')} placeholder="Bash(git push:*)" items={list('permissions.ask')} onChange={(v) => set('permissions.ask', v.length ? v : undefined)} />
        <ListRow label={t('Refusées')} placeholder="Read(./.env)" items={list('permissions.deny')} onChange={(v) => set('permissions.deny', v.length ? v : undefined)} />
        <ListRow label={t('Dossiers supplémentaires')} placeholder="/chemin" items={list('permissions.additionalDirectories')} onChange={(v) => set('permissions.additionalDirectories', v.length ? v : undefined)} />
      </Group>
      <Group title={t('Hooks')}>
        <div className="cc-hooks">
          {hooks.length === 0 && <div className="muted" style={{ padding: '8px 14px' }}>{t('Aucun hook')}</div>}
          {hooks.map((h) => (
            <div key={`${h.event}/${h.group}/${h.index}`} className="cc-hook">
              <select value={h.event} onChange={(e) => setRoot(setHookEvent(root, h, e.target.value))}>{HOOK_EVENTS.map((ev) => <option key={ev}>{ev}</option>)}</select>
              <input value={h.matcher} placeholder={t('matcher (ex. Bash)')} onChange={(e) => setRoot(setHookMatcher(root, h, e.target.value))} style={{ width: 140 }} />
              <input value={h.command} placeholder={t('commande')} onChange={(e) => setRoot(setHookCommand(root, h, e.target.value))} style={{ flex: 1 }} />
              <button className="ibtn" title={t('Retirer')} onClick={() => setRoot(removeHook(root, h))}>{Icons.x(12)}</button>
            </div>
          ))}
          <div style={{ padding: '6px 14px' }}><button className="linkbtn" onClick={() => setRoot(addHook(root, 'Stop'))}>+ {t('Ajouter un hook')}</button></div>
        </div>
      </Group>
      <Group title={t("Variables d'environnement")}>
        <DictRows items={dict('env')} onChange={(v) => set('env', Object.keys(v).length ? v : undefined)} />
      </Group>
      <Group title={t('Plugins')}>
        {Object.keys((getPath(root, 'enabledPlugins') as Record<string, boolean> | undefined) ?? {}).length === 0 ? <div className="muted" style={{ padding: '8px 14px' }}>{t('Aucun plugin')}</div>
          : Object.entries((getPath(root, 'enabledPlugins') as Record<string, boolean>)).sort().map(([k, v]) => (
            <Row key={k} label={k}><Toggle checked={!!v} onChange={(on) => set('enabledPlugins', { ...(getPath(root, 'enabledPlugins') as Record<string, boolean>), [k]: on })} /></Row>
          ))}
      </Group>
    </>
  )
}

function ListRow({ label, placeholder, items, onChange }: { label: string; placeholder: string; items: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const add = () => { const v = draft.trim(); if (v && !items.includes(v)) { onChange([...items, v]); setDraft('') } }
  return (
    <div className="cc-list">
      <div className="cc-list-head"><span>{label}</span><span className="muted">{items.length}</span></div>
      {items.map((it, i) => (
        <div key={i} className="cc-item"><code>{it}</code><button className="ibtn" title={t('Retirer')} onClick={() => onChange(items.filter((_, j) => j !== i))}>{Icons.x(12)}</button></div>
      ))}
      <div className="cc-item"><input value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add() }} style={{ flex: 1 }} /><button className="ibtn" title={t('Ajouter')} onClick={add}>{Icons.plus(12)}</button></div>
    </div>
  )
}

function DictRows({ items, onChange }: { items: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const [k, setK] = useState(''); const [v, setV] = useState('')
  const add = () => { const key = k.trim(); if (key) { onChange({ ...items, [key]: v }); setK(''); setV('') } }
  return (
    <div className="cc-list">
      {Object.keys(items).sort().map((key) => (
        <div key={key} className="cc-item"><code style={{ minWidth: 140 }}>{key}</code><input value={items[key]} onChange={(e) => onChange({ ...items, [key]: e.target.value })} style={{ flex: 1 }} /><button className="ibtn" title={t('Retirer')} onClick={() => { const n = { ...items }; delete n[key]; onChange(n) }}>{Icons.x(12)}</button></div>
      ))}
      <div className="cc-item"><input value={k} placeholder="NOM" onChange={(e) => setK(e.target.value)} style={{ width: 140 }} /><input value={v} placeholder={t('valeur')} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add() }} style={{ flex: 1 }} /><button className="ibtn" title={t('Ajouter')} onClick={add}>{Icons.plus(12)}</button></div>
    </div>
  )
}
