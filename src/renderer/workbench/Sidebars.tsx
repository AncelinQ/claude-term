import { Island, Empty } from './Island'
import { Icons } from './icons'
import { FileTree } from './FileTree'
import { useWorkbench, type Project } from '@/stores/workbench'

export function LeftSidebar({ project }: { project: Project }) {
  const activity = useWorkbench((s) => s.leftActivity)
  if (!activity) return null
  const name = project.root?.split(/[\\/]/).filter(Boolean).pop() ?? ''
  return (
    <div className="sidebar left">
      {activity === 'explorer' && (
        <>
          <Island title={name} icon={Icons.folder(14)} grow
            actions={<button title="Afficher dans le Finder" onClick={() => project.root && window.ct.app.revealInFinder(project.root)}>{Icons.external()}</button>}>
            {project.root ? <FileTree project={project} root={project.root} /> : <Empty>Aucun dossier</Empty>}
          </Island>
          <Island title="Dossiers liés" icon={Icons.link(14)} collapsible>
            <Empty>Lie l'API, le design system… Claude y aura accès.</Empty>
          </Island>
        </>
      )}
      {activity === 'search' && <Island title="Recherche" icon={Icons.search(14)} grow><Empty>Bientôt : recherche de fichiers</Empty></Island>}
      {activity === 'scripts' && <Island title="Scripts npm" icon={Icons.box(14)} grow><Empty>Bientôt : scripts du package.json</Empty></Island>}
      {activity === 'mcp' && (
        <>
          <Island title="MCP du projet" icon={Icons.plug(14)} grow><Empty>Bientôt : .mcp.json</Empty></Island>
          <Island title="MCP perso" icon={Icons.plug(14)} grow collapsible><Empty>Bientôt : claude mcp list</Empty></Island>
        </>
      )}
      {activity === 'plugins' && <Island title="Plugins" icon={Icons.puzzle(14)} grow><Empty>Phase 5</Empty></Island>}
    </div>
  )
}

export function RightSidebar() {
  const activity = useWorkbench((s) => s.rightActivity)
  if (!activity) return null
  return (
    <div className="sidebar right">
      {activity === 'process' && <Island title="Process Claude" icon={Icons.cpu(14)} grow><Empty>Bientôt : processus claude sur cette machine</Empty></Island>}
      {activity === 'history' && <Island title="Historique" icon={Icons.clock(14)} grow><Empty>Bientôt : sessions passées</Empty></Island>}
      {activity === 'skills' && (
        <>
          <Island title="Skills du projet" icon={Icons.sparkle(14)} grow><Empty>Bientôt</Empty></Island>
          <Island title="Skills perso" icon={Icons.sparkle(14)} grow collapsible><Empty>Bientôt</Empty></Island>
        </>
      )}
    </div>
  )
}
