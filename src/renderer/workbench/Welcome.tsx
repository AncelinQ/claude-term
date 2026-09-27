import { Icons } from './icons'
import { useWorkbench, type Project } from '@/stores/workbench'

export function Welcome({ project }: { project: Project }) {
  const { setRoot, settings } = useWorkbench()
  const home = window.ct.home
  const pick = async () => { const d = await window.ct.app.pickFolder(); if (d) setRoot(project.id, d) }
  const short = (p: string) => (p.startsWith(home) ? '~' + p.slice(home.length) : p)
  return (
    <div className="center">
      <div className="island grow">
        <div className="welcome">
          <div>
            <div style={{ color: 'var(--ct-accent)' }}>{Icons.sparkle(40)}</div>
            <h1>ClaudeTerm</h1>
            <p>Ouvre un dossier pour démarrer un projet.</p>
            <button className="btn primary" onClick={pick}>{Icons.folder(14)} Ouvrir un dossier…</button>
            {settings && settings.recentProjects.length > 0 && (
              <div style={{ marginTop: 24, textAlign: 'left', minWidth: 320 }}>
                <div style={{ color: 'var(--ct-text-secondary)', fontWeight: 600, marginBottom: 6 }}>Récents</div>
                {settings.recentProjects.map((r) => (
                  <div key={r} className="tree"><div className="row dir" onClick={() => setRoot(project.id, r)} title={r}>
                    <span className="ico">{Icons.folder(14)}</span><span>{r.split(/[\\/]/).filter(Boolean).pop()}</span>
                    <span style={{ color: 'var(--ct-text-tertiary)', marginLeft: 6 }}>{short(r)}</span>
                  </div></div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
