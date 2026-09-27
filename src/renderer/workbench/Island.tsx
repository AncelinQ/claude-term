import { useState, type ReactNode } from 'react'
import { Icons } from './icons'

/** An independent block with the shared header anatomy: icon, title, actions, collapse. */
export function Island({ title, icon, actions, children, grow, collapsible }: {
  title: string; icon?: ReactNode; actions?: ReactNode; children: ReactNode; grow?: boolean; collapsible?: boolean
}) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div className={'island' + (grow && !collapsed ? ' grow' : '') + (collapsed ? ' collapsed' : '')}>
      <div className="hdr">
        {icon}
        <span>{title}</span>
        <span className="spacer" />
        {actions}
        {collapsible && (
          <button onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Déplier' : 'Replier'}>
            {collapsed ? Icons.chevronDown() : Icons.chevronUp()}
          </button>
        )}
      </div>
      <div className="content">{children}</div>
    </div>
  )
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>
