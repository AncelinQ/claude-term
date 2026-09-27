import { useEffect, useRef, useState } from 'react'
import { monaco } from './monaco'
import { Icons } from '@/workbench/icons'
import { t } from '@/i18n'

type Editor = monaco.editor.IStandaloneCodeEditor
let opener: ((replace: boolean) => void) | null = null
/** Opens the find bar of the editor in front (⌘F), with the replace row (⌘R). */
export function openFind(replace: boolean) { opener?.(replace) }

/** JetBrains-like find / replace bar across the top of the editor. */
export function FindBar({ getEditor }: { getEditor: () => Editor | null }) {
  const [open, setOpen] = useState(false)
  const [replace, setReplace] = useState(false)
  const [q, setQ] = useState('')
  const [r, setR] = useState('')
  const [cs, setCs] = useState(false), [word, setWord] = useState(false), [re, setRe] = useState(false)
  const [count, setCount] = useState(0), [index, setIndex] = useState(-1), [bad, setBad] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const deco = useRef<monaco.editor.IEditorDecorationsCollection | null>(null)
  const matchesRef = useRef<monaco.editor.FindMatch[]>([])

  useEffect(() => {
    opener = (rep) => {
      const e = getEditor(); if (!e) return
      const sel = e.getModel()?.getValueInRange(e.getSelection()!) ?? ''
      if (sel && !sel.includes('\n')) setQ(sel)
      setReplace(rep); setOpen(true)
      setTimeout(() => { input.current?.focus(); input.current?.select() }, 0)
    }
    return () => { opener = null }
  }, [])

  const find = (from?: monaco.Position | null, dir: 1 | -1 = 1) => {
    const e = getEditor(), m = e?.getModel()
    if (!e || !m) return
    deco.current ??= e.createDecorationsCollection()
    if (!q) { deco.current.clear(); matchesRef.current = []; setCount(0); setIndex(-1); setBad(false); return }
    let ms: monaco.editor.FindMatch[] = []
    try { ms = m.findMatches(q, false, re, cs, word ? '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?' : null, true, 5000); setBad(false) } catch { setBad(true) }
    matchesRef.current = ms
    setCount(ms.length)
    if (!ms.length) { deco.current.clear(); setIndex(-1); return }
    const pos = from ?? e.getPosition()!
    let i = dir === 1 ? ms.findIndex((x) => x.range.getStartPosition().isBeforeOrEqual(pos) === false || x.range.getStartPosition().equals(pos)) : -1
    if (dir === -1) { for (let k = ms.length - 1; k >= 0; k--) if (ms[k].range.getStartPosition().isBefore(pos)) { i = k; break } }
    if (i < 0) i = dir === 1 ? 0 : ms.length - 1
    select(i)
  }
  const select = (i: number) => {
    const e = getEditor(); const ms = matchesRef.current
    if (!e || !ms[i]) return
    setIndex(i)
    deco.current!.set(ms.map((x, k) => ({ range: x.range, options: { inlineClassName: k === i ? 'find-current' : 'find-match', overviewRuler: { color: '#e5c07b', position: monaco.editor.OverviewRulerLane.Center } } })))
    e.setSelection(ms[i].range); e.revealRangeInCenterIfOutsideViewport(ms[i].range)
  }
  useEffect(() => { if (open) find(getEditor()?.getSelection()?.getStartPosition()) }, [q, cs, word, re, open])

  const next = () => { const ms = matchesRef.current; if (ms.length) select((index + 1) % ms.length) }
  const prev = () => { const ms = matchesRef.current; if (ms.length) select((index - 1 + ms.length) % ms.length) }
  const replaceText = (m: monaco.editor.FindMatch) => (re && m.matches ? r.replace(/\$(\d)/g, (_, n) => m.matches![+n] ?? '') : r)
  const replaceOne = () => {
    const e = getEditor(); const ms = matchesRef.current
    if (!e || index < 0 || !ms[index]) return
    e.executeEdits('find', [{ range: ms[index].range, text: replaceText(ms[index]) }])
    find(e.getSelection()?.getEndPosition())
  }
  const replaceAll = () => {
    const e = getEditor(); const ms = matchesRef.current
    if (!e || !ms.length) return
    e.pushUndoStop(); e.executeEdits('find', ms.map((m) => ({ range: m.range, text: replaceText(m) }))); e.pushUndoStop()
    find()
  }
  const close = () => { setOpen(false); deco.current?.clear(); getEditor()?.focus() }
  if (!open) return null
  const toggle = (on: boolean, set: (v: boolean) => void, label: string, title: string) => <button className={'fb-opt' + (on ? ' on' : '')} title={title} onClick={() => set(!on)}>{label}</button>
  const onKey = (e: React.KeyboardEvent, isReplace: boolean) => {
    if (e.key === 'Enter' && isReplace) { e.preventDefault(); (e.metaKey || e.ctrlKey) ? replaceAll() : replaceOne() }
    else if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? prev() : next() }
  }
  return (
    <div className="findbar" onKeyDown={(e) => {
      const mod = e.metaKey || e.ctrlKey
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
      else if (mod && e.code === 'KeyR') { e.preventDefault(); e.stopPropagation(); setReplace(true) }
      else if (mod && e.code === 'KeyF') { e.preventDefault(); e.stopPropagation(); input.current?.focus(); input.current?.select() }
    }}>
      <div className="fb-row">
        <span className="fb-ico">{Icons.search(13)}</span>
        <input ref={input} className={bad ? 'bad' : ''} value={q} placeholder={t('Rechercher')} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => onKey(e, false)} spellCheck={false} />
        {toggle(cs, setCs, 'Cc', t('Respecter la casse'))}{toggle(word, setWord, 'W', t('Mot entier'))}{toggle(re, setRe, '.*', t('Expression régulière'))}
        <span className={'fb-count' + (q && !count ? ' none' : '')}>{q ? (count ? `${index + 1}/${count}${count >= 5000 ? '+' : ''}` : t('0 résultat')) : ''}</span>
        <button className="fb-btn" title={t('Précédent (⇧↩)')} onClick={prev}>{Icons.chevronUp(14)}</button>
        <button className="fb-btn" title={t('Suivant (↩)')} onClick={next}>{Icons.chevronDown(14)}</button>
        <button className="fb-btn" title={t('Remplacer')} onClick={() => setReplace(!replace)}>{Icons.columns(13)}</button>
        <span className="spacer" />
        <button className="fb-btn" title={t('Fermer (Échap)')} onClick={close}>{Icons.x(13)}</button>
      </div>
      {replace && (
        <div className="fb-row">
          <span className="fb-ico" />
          <input value={r} placeholder={t('Remplacer par')} onChange={(e) => setR(e.target.value)} onKeyDown={(e) => onKey(e, true)} spellCheck={false} />
          <button className="btn" disabled={index < 0} onClick={replaceOne}>{t('Remplacer')}</button>
          <button className="btn" disabled={!count} onClick={replaceAll}>{t('Tout remplacer')}</button>
        </div>
      )}
    </div>
  )
}
