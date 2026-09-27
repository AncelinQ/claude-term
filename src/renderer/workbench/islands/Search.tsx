import { useEffect, useRef, useState } from 'react'
import { Icons } from '../icons'
import { Island, Empty } from '../Island'
import { useWorkbench, type Project } from '@/stores/workbench'
import { t } from '@/i18n'

/** File name search (fuzzy) over the project; Enter or double-click opens in the editor. */
export function SearchIsland({ project }: { project: Project }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<string[]>([])
  const [sel, setSel] = useState(0)
  const openFile = useWorkbench((s) => s.openFile)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  useEffect(() => {
    if (!q.trim()) { setResults([]); return }
    let live = true
    const t = setTimeout(() => window.ct.search.files(project.root!, q).then((r) => { if (live) { setResults(r); setSel(0) } }), 120)
    return () => { live = false; clearTimeout(t) }
  }, [q, project.root])
  const open = (rel: string) => openFile(project.id, project.root + '/' + rel)
  return (
    <Island title={t('Recherche')} icon={Icons.search(14)} grow>
      <div className="search">
        <input ref={ref} value={q} placeholder={t('nom de fichier…')} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
            else if (e.key === 'Enter' && results[sel]) open(results[sel])
          }} />
      </div>
      {q && results.length === 0 && <Empty>{t('Aucun fichier')}</Empty>}
      <div className="results">
        {results.map((r, i) => (
          <div key={r} className={'frow' + (i === sel ? ' sel' : '')} onClick={() => setSel(i)} onDoubleClick={() => open(r)} title={r}>
            <span className="ico">{Icons.file(12)}</span>
            <span className="name">{r.split('/').pop()}</span>
            <span className="rel">{r.includes('/') ? r.slice(0, r.lastIndexOf('/')) : ''}</span>
          </div>
        ))}
      </div>
    </Island>
  )
}
