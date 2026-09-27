import { useEffect, useState } from 'react'
import type { ViewItem, ViewModel } from '@shared/plugins'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { Icons } from './icons'
import { Island, Empty } from './Island'
import { usePlugins } from '@/stores/plugins'
import { t } from '@/i18n'

const icon = (name: string | undefined, size = 12) => {
  const f = (Icons as Record<string, ((s?: number) => React.ReactElement) | undefined>)[name ?? '']
  return f ? f(size) : Icons.puzzle(size)
}

/** Renders a plugin's declarative view model inside an island. */
export function PluginViewIsland({ viewId, title, grow }: { viewId: string; title: string; grow?: boolean }) {
  const model = usePlugins((s) => s.views[viewId])
  useEffect(() => { if (!model) window.ct.plugins.view(viewId).then((m) => { if (m) usePlugins.setState((s) => ({ views: { ...s.views, [viewId]: m } })) }) }, [viewId])
  const send = (type: 'select' | 'open' | 'action' | 'toolbar', itemId?: string, actionId?: string) => window.ct.plugins.event({ viewId, type, itemId, actionId })
  const toolbar = model && 'toolbar' in model && model.toolbar?.length ? (
    <>{model.toolbar.map((a) => <button key={a.id} title={a.title} onClick={() => send('toolbar', undefined, a.id)}>{icon(a.icon, 14)}</button>)}</>
  ) : undefined
  return (
    <Island title={title} icon={Icons.puzzle(14)} actions={toolbar} grow={grow}>
      {!model ? <Empty>{t('Chargement…')}</Empty>
        : model.kind === 'empty' ? <Empty>{model.text}</Empty>
        : model.kind === 'markdown' ? <div className="md" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(model.text, { async: false }) as string) }} />
        : <div className="list pv">{model.items.map((it) => <Node key={it.id} item={it} depth={0} tree={model.kind === 'tree'} send={send} />)}</div>}
    </Island>
  )
}

function Node({ item, depth, tree, send }: { item: ViewItem; depth: number; tree: boolean; send: (type: 'select' | 'open' | 'action', itemId?: string, actionId?: string) => void }) {
  const [open, setOpen] = useState(item.expanded ?? true)
  const hasChildren = tree && !!item.children?.length
  return (
    <>
      <div className={'lrow pv-row' + (hasChildren ? ' group' : '')} style={{ paddingLeft: 10 + depth * 14 }} onClick={() => (hasChildren ? setOpen(!open) : send('select', item.id))} onDoubleClick={() => !hasChildren && send('open', item.id)} title={item.detail}>
        {hasChildren ? <span className={'chev' + (open ? ' open' : '')}>{Icons.chevron(10)}</span> : <span className="ico">{icon(item.icon)}</span>}
        <div className="lbody">
          <div className="head"><span className="name">{item.label}</span>{item.badges?.map((b) => <span key={b} className="badge dim">{b}</span>)}</div>
          {item.detail && !hasChildren && <div className="desc">{item.detail}</div>}
        </div>
        {item.actions?.length ? (
          <span className={'acts' + (item.actions.some((a) => a.primary) ? ' always' : '')}>
            {item.actions.map((a) => <button key={a.id} title={a.title} className={a.primary ? 'primary' : ''} onClick={(e) => { e.stopPropagation(); send('action', item.id, a.id) }}>{icon(a.icon)}</button>)}
          </span>
        ) : null}
      </div>
      {hasChildren && open && item.children!.map((c) => <Node key={c.id} item={c} depth={depth + 1} tree={tree} send={send} />)}
    </>
  )
}
