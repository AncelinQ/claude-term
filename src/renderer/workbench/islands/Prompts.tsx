import { useEffect, useRef, useState } from 'react'
import { Icons } from '../icons'
import { Island, Empty } from '../Island'
import { useWorkbench } from '@/stores/workbench'
import { runPrompt } from '@/prompts'
import { fromEvent, label as keyLabel } from '@shared/keymap'
import { frequentCommands, PROMPT_VARIABLES, type SavedPrompt } from '@shared/prompts'
import { t } from '@/i18n'

const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)

/** Saved prompts: sent (or typed to complete) in the project's Claude tab, by a click, the palette (/) or their shortcut. */
export function PromptsIsland() {
  const prompts = useWorkbench((s) => s.settings?.prompts ?? [])
  const [editing, setEditing] = useState<SavedPrompt | null>(null)
  const [error, setError] = useState<{ id: string; text: string } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  useEffect(() => { window.ct.claude.commandCounts().then(setCounts) }, [])
  const mac = window.ct.platform === 'darwin'
  const save = (list: SavedPrompt[]) => window.ct.settings.set({ prompts: list })
  const run = async (p: SavedPrompt) => { const why = await runPrompt(p); setError(why ? { id: p.id, text: why } : null) }
  const suggestions = frequentCommands(counts, prompts).slice(0, 6)
  const actions = <button title={t('Nouveau prompt')} onClick={() => setEditing({ id: newId(), name: '', text: '', mode: 'send' })}>{Icons.plus()}</button>
  return (
    <Island title={t('Prompts')} icon={Icons.prompt(14)} grow actions={actions}>
      {editing && <PromptForm prompt={editing} onCancel={() => setEditing(null)} onSave={(p) => { const i = prompts.findIndex((x) => x.id === p.id); save(i >= 0 ? prompts.map((x) => (x.id === p.id ? p : x)) : [...prompts, p]); setEditing(null) }} />}
      <div className="list">
        {!prompts.length && !editing && (suggestions.length
          ? <div className="desc muted" style={{ padding: '8px 10px' }}>{t('Aucun prompt enregistré : + pour en créer un')}</div>
          : <Empty>{t('Aucun prompt enregistré : + pour en créer un')}</Empty>)}
        {prompts.map((p) => (
          <div key={p.id}>
            <div className="lrow" title={p.text} onDoubleClick={() => run(p)}>
              <span className="ico">{Icons.prompt(12)}</span>
              <div className="lbody">
                <div className="head"><span className="name">{p.name || t('(sans nom)')}</span><span className="badge dim">{p.mode === 'send' ? t('envoi') : t('à compléter')}</span>{p.shortcut && <span className="badge dim">{keyLabel(p.shortcut, mac)}</span>}</div>
                <div className="desc">{p.text.replace(/\s+/g, ' ')}</div>
              </div>
              <span className="acts">
                {deleting === p.id ? <>
                  <button className="linkbtn" onClick={() => { save(prompts.filter((x) => x.id !== p.id)); setDeleting(null) }}>{t('Supprimer')}</button>
                  <button className="linkbtn" onClick={() => setDeleting(null)}>{t('Annuler')}</button>
                </> : <>
                  <button title={p.mode === 'send' ? t('Envoyer à Claude') : t('Taper dans Claude, à compléter')} onClick={() => run(p)}>{Icons.play(12)}</button>
                  <button title={t('Modifier')} onClick={() => setEditing(p)}>{Icons.edit(12)}</button>
                  <button title={t('Supprimer')} onClick={() => setDeleting(p.id)}>{Icons.trash(12)}</button>
                </>}
              </span>
            </div>
            {error?.id === p.id && <div className="desc error" style={{ padding: '0 10px 4px 34px' }}>{error.text}</div>}
          </div>
        ))}
        {suggestions.length > 0 && <>
          <div className="group-title muted">{t('Souvent tapées ces 30 jours')}</div>
          {suggestions.map((s) => (
            <div key={s.command} className="lrow">
              <span className="ico">{Icons.terminal(12)}</span>
              <div className="lbody"><div className="head"><span className="name">{s.command}</span><span className="badge dim">{s.count}×</span></div></div>
              <span className="acts"><button className="linkbtn" onClick={() => setEditing({ id: newId(), name: s.command, text: s.command + ' ', mode: 'insert' })}>{t('Garder')}</button></span>
            </div>
          ))}
        </>}
      </div>
    </Island>
  )
}

function PromptForm({ prompt, onSave, onCancel }: { prompt: SavedPrompt; onSave: (p: SavedPrompt) => void; onCancel: () => void }) {
  const [p, setP] = useState(prompt)
  const [recording, setRecording] = useState(false)
  const text = useRef<HTMLTextAreaElement>(null)
  const mac = window.ct.platform === 'darwin'
  // a variable goes where the caret is
  const insert = (v: string) => {
    const el = text.current
    const at = el?.selectionStart ?? p.text.length
    setP({ ...p, text: p.text.slice(0, at) + v + p.text.slice(el?.selectionEnd ?? at) })
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + v.length, at + v.length) })
  }
  return (
    <div className="links-editor prompt-form">
      <input autoFocus value={p.name} placeholder={t('Nom du prompt')} onChange={(e) => setP({ ...p, name: e.target.value })} />
      <textarea ref={text} rows={5} value={p.text} spellCheck={false} placeholder={t('Texte envoyé à Claude…')} onChange={(e) => setP({ ...p, text: e.target.value })} />
      <div className="row-actions">{PROMPT_VARIABLES.map((v) => <button key={v} className="linkbtn" title={t('Insérer la variable')} onClick={() => insert(v)}>{v}</button>)}</div>
      <div className="row-actions">
        <select value={p.mode} onChange={(e) => setP({ ...p, mode: e.target.value as SavedPrompt['mode'] })}>
          <option value="send">{t('Envoyer (puis Entrée)')}</option><option value="insert">{t('Taper, à compléter')}</option>
        </select>
        <button className={'key-recorder' + (recording ? ' on' : '')} onClick={() => setRecording(true)} onBlur={() => setRecording(false)}
          onKeyDown={(e) => {
            if (!recording) return
            e.preventDefault(); e.stopPropagation()
            if (e.key === 'Escape') return setRecording(false)
            const combo = e.key === 'Backspace' && !e.metaKey && !e.ctrlKey && !e.altKey ? '' : fromEvent(e.nativeEvent, mac)
            if (combo === null) return
            setP({ ...p, shortcut: combo || undefined }); setRecording(false)
          }}>
          {recording ? t('Appuie sur les touches…') : p.shortcut ? keyLabel(p.shortcut, mac) : t('Raccourci…')}
        </button>
      </div>
      <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onCancel}>{t('Annuler')}</button>
        <button className="btn primary" disabled={!p.text.trim()} onClick={() => onSave({ ...p, name: p.name.trim() || p.text.trim().split('\n')[0].slice(0, 40) })}>{t('Enregistrer')}</button>
      </div>
    </div>
  )
}
