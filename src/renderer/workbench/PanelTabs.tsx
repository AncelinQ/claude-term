import type { ReactNode } from 'react'
import { useStoredSize } from './Split'

export interface PanelTab { id: string; label: string; count?: number; content: ReactNode }

/**
 * Tabs inside an island, over its whole width (equal parts), above the island's content: the Exécuteurs panel
 * (Scripts | Tests), the center bottom block later. The open tab is remembered (settings.layout, by `storeKey`).
 */
export function PanelTabs({ tabs, storeKey }: { tabs: PanelTab[]; storeKey: string }) {
  const [index, setIndex] = useStoredSize('tab:' + storeKey, 0)
  const cur = tabs[Math.min(Math.max(0, index), tabs.length - 1)]
  return (
    <div className="panel-tabs">
      <div className="panel-tabs-bar" role="tablist">
        {tabs.map((t, i) => (
          <button key={t.id} role="tab" aria-selected={t === cur} className={t === cur ? 'on' : ''} onClick={() => setIndex(i)}>
            <span>{t.label}</span>{t.count ? <span className="count">{t.count}</span> : null}
          </button>
        ))}
      </div>
      <div className="panel-tabs-body">{cur?.content}</div>
    </div>
  )
}
