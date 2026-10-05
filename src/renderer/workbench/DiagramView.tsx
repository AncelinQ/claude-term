import { useEffect, useRef, useState } from 'react'
import type { SessionDiagram } from '@shared/ipc'
import type { Tab } from '@/stores/workbench'
import { Empty } from './Island'
import { formatRunCost } from '@shared/costs'
import { currentLanguage, t } from '@/i18n'

/** a theme token as a hex colour (Mermaid reads no CSS variable), else undefined */
function token(name: string): string | undefined {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--ct-' + name).trim()
  return /^#[0-9a-f]{3,8}$/i.test(v) ? v : undefined
}

let seq = 0

/**
 * The diagram of the tab's session: drawn on a click by claude -p from its requests and diffs (its cost shown, kept
 * per session), rendered by Mermaid in the theme's colours.
 */
export function DiagramView({ tab }: { tab: Tab }) {
  const [state, setState] = useState<{ diagram?: SessionDiagram | null; error?: string; drawing?: boolean }>({})
  const [svg, setSvg] = useState<string | null>(null)
  const host = useRef<HTMLDivElement>(null)
  const sessionId = tab.session?.sessionId
  useEffect(() => { setState({}); setSvg(null); window.ct.claude.diagram(tab.id, false, currentLanguage()).then(setState) }, [tab.id, sessionId])
  const source = state.diagram?.mermaid
  useEffect(() => {
    if (!source) return
    let live = true
    import('mermaid').then(async ({ default: mermaid }) => {
      const dark = document.documentElement.dataset.theme !== 'light'
      const vars = { background: token('island-bg'), primaryColor: token('island-header-bg'), primaryTextColor: token('text'), primaryBorderColor: token('accent'), lineColor: token('text-secondary'), textColor: token('text') }
      const themeVariables = Object.fromEntries(Object.entries(vars).filter(([, v]) => v))
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: Object.keys(themeVariables).length === 6 ? 'base' : dark ? 'dark' : 'default', themeVariables, fontFamily: getComputedStyle(document.body).fontFamily })
      try {
        const r = await mermaid.render('ct-diagram-' + ++seq, source)
        if (live) setSvg(r.svg)
      } catch (e) { if (live) setState((s) => ({ ...s, error: t('Mermaid ne lit pas ce schéma : {e}', { e: String((e as Error)?.message ?? e).split('\n')[0] }) })) }
    })
    return () => { live = false }
  }, [source])
  const draw = async () => {
    setState((s) => ({ ...s, drawing: true, error: undefined }))
    const r = await window.ct.claude.diagram(tab.id, true, currentLanguage())
    setState((s) => ({ diagram: r.diagram ?? s.diagram, error: r.error }))
  }
  if (!sessionId) return <Empty>{t('La session apparaît ici dès sa première demande.')}</Empty>
  const d = state.diagram
  return (
    <div className="diagram-view">
      <div className="cc-bar">
        <button className="btn" disabled={state.drawing} onClick={draw}>{state.drawing ? <span className="spin" /> : null}{d ? t('Redessiner') : t('Dessiner le schéma')}</button>
        <span className="muted">{state.drawing ? t('Claude lit la session…') : d
          ? t('Dessiné le {at}{cost}', { at: new Date(d.at).toLocaleString(), cost: d.costUsd !== undefined ? ' · ' + formatRunCost(d.costUsd) : '' }) + (d.truncated ? ' · ' + t('session trop longue : résumée') : '')
          : t('Claude dessine ce que la session a changé, à partir de ses demandes et de ses diffs (claude -p, plafonné à 1 $).')}</span>
      </div>
      {state.error && <div className="tree-error">{state.error}</div>}
      {svg && <div className="diagram" ref={host} dangerouslySetInnerHTML={{ __html: svg }} />}
    </div>
  )
}
