import { useState, type ReactNode } from 'react'
import { Icons } from './icons'

/** An independent block with the shared header anatomy: icon, title, actions, collapse. */
export function Island({ title, icon, actions, children, grow, collapsible, collapsed: controlled, onCollapse, dataView }: {
  title: ReactNode; icon?: ReactNode; actions?: ReactNode; children: ReactNode; grow?: boolean; collapsible?: boolean
  collapsed?: boolean; onCollapse?: (c: boolean) => void; dataView?: string
}) {
  const [own, setOwn] = useState(false)
  const collapsed = controlled ?? own
  const setCollapsed = (c: boolean) => { setOwn(c); onCollapse?.(c) }
  return (
    <div className={'island' + (grow && !collapsed ? ' grow' : '') + (collapsed ? ' collapsed' : '')} data-view={dataView}>
      <div className="hdr">
        {icon}
        {typeof title === 'string' ? <span>{title}</span> : title}
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
