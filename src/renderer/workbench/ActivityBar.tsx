import type React from "react"
import { useMemo } from 'react'
import { Icons } from './icons'
import { useWorkbench, type LeftActivity, type RightActivity } from '@/stores/workbench'
import { usePlugins } from '@/stores/plugins'
import { useUpdate } from '@/stores/update'

const pluginIcon = (name: string) => { const f = (Icons as Record<string, ((s?: number) => React.ReactElement) | undefined>)[name]; return f ? f() : Icons.puzzle() }

function PluginEntries({ side, current, select }: { side: 'left' | 'right'; current: string | null; select: (id: string | null) => void }) {
  const plugins = usePlugins((s) => s.plugins)
  const entries = useMemo(() => usePlugins.getState().activities(side), [plugins, side])
  if (!entries.length) return null
  return (
    <>
      <span className="sep" />
      {entries.map((a) => (
        <button key={a.id} className={current === a.id ? 'on' : ''} title={a.title} onClick={() => select(current === a.id ? null : a.id)}>{pluginIcon(a.icon)}</button>
      ))}
    </>
  )
}
import { t } from '@/i18n'

const LEFT: { id: LeftActivity; title: string; icon: () => React.ReactElement }[] = [
  { id: 'explorer', title: 'Explorateur (⌘1)', icon: () => Icons.files() },
  { id: 'search', title: 'Recherche (⌘2)', icon: () => Icons.search() },
  { id: 'history', title: 'Historique du projet (⌘3)', icon: () => Icons.clock() },
  { id: 'skills', title: 'Skills du projet (⌘4)', icon: () => Icons.sparkle() },
  { id: 'mcp', title: 'MCP (⌘5)', icon: () => Icons.plug() },
  { id: 'plugins', title: 'Plugins (⌘6)', icon: () => Icons.puzzle() },
]
const RIGHT: { id: RightActivity; title: string; icon: () => React.ReactElement }[] = [
  { id: 'process', title: 'Process Claude', icon: () => Icons.cpu() },
  { id: 'history', title: 'Historique (toutes les sessions)', icon: () => Icons.clock() },
  { id: 'skills', title: 'Skills perso et plugins', icon: () => Icons.sparkle() },
]

export function LeftActivityBar() {
  const { leftActivity, setLeft } = useWorkbench()
  return (
    <div className="activity left">
      {LEFT.map((a) => (
        <button key={a.id} className={leftActivity === a.id ? 'on' : ''} title={t(a.title)} onClick={() => setLeft(leftActivity === a.id ? null : a.id)}>
          {a.icon()}
        </button>
      ))}
      <PluginEntries side="left" current={leftActivity} select={(id) => setLeft(id as LeftActivity | null)} />
    </div>
  )
}

export function RightActivityBar() {
  const { rightActivity, setRight, showSettings, setShowSettings } = useWorkbench()
  const update = useUpdate((s) => s.state)
  return (
    <div className="activity right">
      {RIGHT.map((a) => (
        <button key={a.id} className={rightActivity === a.id ? 'on' : ''} title={t(a.title)} onClick={() => setRight(rightActivity === a.id ? null : a.id)}>
          {a.icon()}
        </button>
      ))}
      <PluginEntries side="right" current={rightActivity} select={(id) => setRight(id as RightActivity | null)} />
      <span className="spacer" />
      {update.status === 'ready' && <button className="update" title={t('Version {v} prête : redémarrer pour l\'installer (les terminaux seront fermés)', { v: update.version ?? '' })} onClick={() => window.ct.update.install()}>{Icons.download()}</button>}
      <button className={showSettings ? 'on' : ''} title={t(window.ct.platform === 'darwin' ? 'Réglages (⌘,)' : 'Réglages (Ctrl+,)')} onClick={() => setShowSettings(!showSettings)}>{Icons.gear()}</button>
    </div>
  )
}
