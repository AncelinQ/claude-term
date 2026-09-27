import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ViewAction, ViewItem, ViewModel } from '@shared/plugins'
import { FILE_COLORS } from '@shared/plugins'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { Icons } from './icons'
import { Island, Empty } from './Island'
import { ContextMenu, type MenuItem } from './Menu'
import { usePlugins } from '@/stores/plugins'
import { t } from '@/i18n'

const icon = (name: string | undefined, size = 12) => {
  const f = (Icons as Record<string, ((s?: number) => React.ReactElement) | undefined>)[name ?? '']
  return f ? f(size) : Icons.puzzle(size)
}
const colorOf = (c?: string) => (!c ? undefined : c.startsWith('#') ? c : `var(--ct-${c.replace(/\./g, '-')})`)

/** Colored extension chip for a file path. */
function FileChip({ path }: { path: string }) {
  const ext = (path.split('.').pop() ?? '').toLowerCase()
  const color = FILE_COLORS[ext] ?? 'var(--ct-text-tertiary)'
  const label = ext.length <= 4 && ext !== path.toLowerCase() ? ext.slice(0, 4) : '·'
  return <span className="fchip" style={{ background: `color-mix(in srgb, ${color} 22%, transparent)`, color }}>{label}</span>
}

export type Send = (type: 'select' | 'open' | 'action' | 'toolbar' | 'check' | 'input' | 'button' | 'menu', extra?: { itemId?: string; actionId?: string; value?: boolean | string; fieldId?: string }) => void

/** Renders a plugin's declarative view model inside an island (sidebar placement). */
export function PluginViewIsland({ viewId, title, grow }: { viewId: string; title: string; grow?: boolean }) {
  const model = usePlugins((s) => s.views[viewId])
  useEffect(() => { if (!model) window.ct.plugins.view(viewId).then((m) => { if (m) usePlugins.setState((s) => ({ views: { ...s.views, [viewId]: m } })) }) }, [viewId])
  const send: Send = (type, extra) => window.ct.plugins.event({ viewId, type, ...extra })
  const toolbar = model && 'toolbar' in model && model.toolbar?.length ? (
    <>{model.toolbar.map((a) => <button key={a.id} title={a.title} disabled={a.disabled} onClick={() => send('toolbar', { actionId: a.id })}>{icon(a.icon, 14)}</button>)}</>
  ) : undefined
  return (
    <Island title={(model && 'title' in model && model.title) || title} icon={Icons.puzzle(14)} actions={toolbar} grow={grow} dataView={viewId}>
      <PluginViewBody model={model} send={send} />
    </Island>
  )
}

/** The body of a view: list/tree with optional search, footer and detail pane; markdown; diff. */
export function PluginViewBody({ model, send, wide }: { model: ViewModel | undefined; send: Send; wide?: boolean }) {
  const [q, setQ] = useState('')
  const [ctx, setCtx] = useState<{ x: number; y: number; item: ViewItem } | null>(null)
  if (!model) return <Empty>{t('Chargement…')}</Empty>
  if (model.kind === 'empty') return <Empty>{model.text}</Empty>
  if (model.kind === 'markdown') return <div className="md" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(model.text, { async: false }) as string) }} />
  if (model.kind === 'diff') return <DiffText text={model.text} />
  const items = q ? filterItems(model.items, q.toLowerCase()) : model.items
  const list = (
    <div className="pv-main">
      {model.search && <div className="search"><input value={q} placeholder={t('filtrer…')} onChange={(e) => setQ(e.target.value)} autoFocus /></div>}
      <div className="list pv">
        {items.length === 0 && <Empty>{q ? t('Aucun résultat') : '—'}</Empty>}
        {items.map((it) => <Node key={it.id} item={it} depth={0} tree={model.kind === 'tree'} send={send} onMenu={(e, item) => { e.preventDefault(); e.stopPropagation(); setCtx({ x: e.clientX, y: e.clientY, item }) }} />)}
      </div>
      {model.footer && <Footer footer={model.footer} send={send} />}
      <ContextMenu at={ctx} onClose={() => setCtx(null)} items={(ctx?.item.contextMenu ?? []).map((a): MenuItem | 'sep' => a === 'sep' ? 'sep' : { label: a.title, icon: a.icon ? icon(a.icon, 13) : undefined, shortcut: a.shortcut, disabled: a.disabled, onSelect: () => send('menu', { itemId: ctx!.item.id, actionId: a.id }) })} />
    </div>
  )
  if (model.detail && wide) {
    return (
      <div className="pv-split">
        {list}
        <div className="pv-detail"><PluginViewBody model={model.detail} send={send} /></div>
      </div>
    )
  }
  return list
}

function filterItems(items: ViewItem[], q: string): ViewItem[] {
  return items.flatMap((it) => {
    const kids = it.children ? filterItems(it.children, q) : undefined
    const hit = it.label.toLowerCase().includes(q) || (it.detail ?? '').toLowerCase().includes(q)
    if (hit || (kids && kids.length)) return [{ ...it, children: kids, expanded: true }]
    return []
  })
}

function DiffText({ text }: { text: string }) {
  return <div className="diff">{text.split('\n').map((l, i) => <div key={i} className={'dl ' + (l.startsWith('+') && !l.startsWith('+++') ? 'add' : l.startsWith('-') && !l.startsWith('---') ? 'del' : l.startsWith('@@') ? 'hunk' : '')}>{l}</div>)}</div>
}

function Footer({ footer, send }: { footer: NonNullable<Extract<ViewModel, { kind: 'list' }>['footer']>; send: Send }) {
  const [vals, setVals] = useState<Record<string, string>>({})
  useEffect(() => { setVals((v) => { const n = { ...v }; for (const f of footer.fields ?? []) if (n[f.id] === undefined) n[f.id] = f.value ?? ''; return n }) }, [footer.fields?.map((f) => f.id + f.value).join('|')])
  return (
    <div className="pv-footer">
      {footer.fields?.map((f) => f.multiline
        ? <textarea key={f.id} placeholder={f.placeholder} value={vals[f.id] ?? ''} rows={3} onChange={(e) => { setVals({ ...vals, [f.id]: e.target.value }); send('input', { fieldId: f.id, value: e.target.value }) }} />
        : <input key={f.id} placeholder={f.placeholder} value={vals[f.id] ?? ''} onChange={(e) => { setVals({ ...vals, [f.id]: e.target.value }); send('input', { fieldId: f.id, value: e.target.value }) }} />)}
      {(footer.checks?.length || footer.buttons?.length) ? (
        <div className="pv-footer-row">
          {footer.checks?.map((c) => <label key={c.id} className="check"><input type="checkbox" checked={c.checked} onChange={(e) => send('check', { itemId: c.id, value: e.target.checked })} /> {c.label}</label>)}
          <span className="spacer" />
          {footer.buttons?.map((b) => <button key={b.id} className={'btn' + (b.primary ? ' primary' : '')} disabled={b.disabled} title={b.title} onClick={() => send('button', { actionId: b.id })}>{b.icon && icon(b.icon, 13)} {b.title}</button>)}
        </div>
      ) : null}
    </div>
  )
}

function checkState(item: ViewItem): boolean | 'mixed' | undefined {
  if (item.children?.length) {
    const states = item.children.map(checkState).filter((s) => s !== undefined)
    if (!states.length) return item.checked
    if (states.every((s) => s === true)) return true
    if (states.every((s) => s === false)) return false
    return 'mixed'
  }
  return item.checked
}

function Node({ item, depth, tree, send, onMenu }: { item: ViewItem; depth: number; tree: boolean; send: Send; onMenu: (e: React.MouseEvent, item: ViewItem) => void }) {
  const [open, setOpen] = useState(item.expanded ?? true)
  const hasChildren = tree && !!item.children?.length
  const cs = checkState(item)
  const cbRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (cbRef.current) cbRef.current.indeterminate = cs === 'mixed' }, [cs])
  return (
    <>
      <div className={'lrow pv-row' + (hasChildren ? ' group' : '') + (item.muted ? ' muted' : '')} style={{ paddingLeft: 8 + depth * 20 }}
        onClick={() => (hasChildren ? setOpen(!open) : send('select', { itemId: item.id }))} onDoubleClick={() => !hasChildren && send('open', { itemId: item.id })}
        onContextMenu={(e) => item.contextMenu?.length && onMenu(e, item)} title={item.detail}>
        {hasChildren ? <span className={'chev' + (open ? ' open' : '')}>{Icons.chevron(10)}</span> : tree ? <span className="chev placeholder" /> : null}
        {cs !== undefined && <input ref={cbRef} type="checkbox" className="pv-check" checked={cs === true} onClick={(e) => e.stopPropagation()} onChange={(e) => send('check', { itemId: item.id, value: e.target.checked })} />}
        {!hasChildren && (item.file ? <FileChip path={item.file} /> : <span className="ico" style={{ color: colorOf(item.color) }}>{icon(item.icon)}</span>)}
        <span className="pv-label"><span className="name">{item.label}</span>{item.detail && <span className="pv-detail-inline">{item.detail}</span>}{item.badges?.map((b) => <span key={b} className="badge dim">{b}</span>)}</span>
        {item.extra && <span className="pv-extra">{item.extra}</span>}
        {item.actions?.length ? (
          <span className={'acts' + (item.actions.some((a) => a.primary) ? ' always' : '')}>
            {item.actions.map((a) => <button key={a.id} title={a.title} className={a.primary ? 'primary' : ''} disabled={a.disabled} onClick={(e) => { e.stopPropagation(); send('action', { itemId: item.id, actionId: a.id }) }}>{icon(a.icon)}</button>)}
          </span>
        ) : null}
      </div>
      {hasChildren && open && item.children!.map((c) => <Node key={c.id} item={c} depth={depth + 1} tree={tree} send={send} onMenu={onMenu} />)}
    </>
  )
}

/** Popover anchored under a view's island header. */
export function PluginPopover({ id, anchorViewId, model, onClose }: { id: string; anchorViewId: string; model: ViewModel; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    const el = document.querySelector(`[data-view="${anchorViewId}"] > .hdr`)
    const r = el?.getBoundingClientRect()
    setPos(r ? { x: Math.max(8, r.left), y: r.bottom + 4 } : { x: 100, y: 100 })
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('mousedown', onDown); window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey, true) }
  }, [anchorViewId])
  if (!pos) return null
  const send: Send = (type, extra) => window.ct.plugins.event({ viewId: id, type, ...extra })
  return (
    <div className="menu ctx popover" ref={ref} style={{ left: pos.x, top: pos.y }}>
      <PluginViewBody model={model} send={send} />
    </div>
  )
}
