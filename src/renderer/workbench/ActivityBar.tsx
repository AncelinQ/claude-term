import type React from "react"
import { Icons } from './icons'
import { useWorkbench, type LeftActivity, type RightActivity } from '@/stores/workbench'

const LEFT: { id: LeftActivity; title: string; icon: () => React.ReactElement }[] = [
  { id: 'explorer', title: 'Explorateur (⌘1)', icon: () => Icons.files() },
  { id: 'search', title: 'Recherche (⌘2)', icon: () => Icons.search() },
  { id: 'scripts', title: 'Scripts (⌘3)', icon: () => Icons.box() },
  { id: 'skills', title: 'Skills du projet (⌘4)', icon: () => Icons.sparkle() },
  { id: 'mcp', title: 'MCP (⌘5)', icon: () => Icons.plug() },
  { id: 'plugins', title: 'Plugins (⌘6)', icon: () => Icons.puzzle() },
]
const RIGHT: { id: RightActivity; title: string; icon: () => React.ReactElement }[] = [
  { id: 'process', title: 'Process Claude', icon: () => Icons.cpu() },
  { id: 'history', title: 'Historique', icon: () => Icons.clock() },
  { id: 'skills', title: 'Skills perso et plugins', icon: () => Icons.sparkle() },
]

export function LeftActivityBar() {
  const { leftActivity, setLeft } = useWorkbench()
  return (
    <div className="activity left">
      {LEFT.map((a) => (
        <button key={a.id} className={leftActivity === a.id ? 'on' : ''} title={a.title} onClick={() => setLeft(leftActivity === a.id ? null : a.id)}>
          {a.icon()}
        </button>
      ))}
    </div>
  )
}

export function RightActivityBar() {
  const { rightActivity, setRight } = useWorkbench()
  return (
    <div className="activity right">
      {RIGHT.map((a) => (
        <button key={a.id} className={rightActivity === a.id ? 'on' : ''} title={a.title} onClick={() => setRight(rightActivity === a.id ? null : a.id)}>
          {a.icon()}
        </button>
      ))}
    </div>
  )
}
