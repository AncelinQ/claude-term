import { useEffect, useMemo } from 'react'
import type { ViewModel } from '@shared/plugins'
import { runnablesTree } from '@shared/runnables'
import { Icons } from '../icons'
import { Island, Empty } from '../Island'
import { PluginViewBody, type Send } from '../PluginView'
import { PanelTabs } from '../PanelTabs'
import { useWorkbench, type Project } from '@/stores/workbench'
import { useRunnables } from '@/stores/runnables'
import { t } from '@/i18n'

/**
 * The Exécuteurs panel (left): Scripts (npm, make, cargo, go, python, shell scripts of the project, what runs first)
 * and Tests, as full-width tabs above the filter. Scripts is rendered by the same tree as plugin views (search, badges,
 * remembered open state).
 */
export function RunIsland({ project }: { project: Project }) {
  const groups = useRunnables((s) => s.groups)
  const launched = useRunnables((s) => s.launched)
  const tabs = useWorkbench((s) => s.projects)   // runs follow the tabs (started, ended)
  useEffect(() => { useRunnables.getState().load(project.root) }, [project.root])
  useEffect(() => window.ct.runnables.onChanged((root) => { if (root === useRunnables.getState().root) useRunnables.getState().load(root) }), [])
  const running = useMemo(() => useRunnables.getState().running(), [launched, tabs])
  const model: ViewModel = !project.root ? { kind: 'empty', text: t('Ouvre un projet') }
    : !groups.length && !running.length ? { kind: 'empty', text: t('Rien à lancer ici : pas de package.json, Makefile, Cargo.toml, go.mod ni script.') }
    : { kind: 'tree', search: true, items: runnablesTree(groups, running) }
  const r = useRunnables.getState()
  const send: Send = (type, extra) => {
    const id = extra?.itemId ?? ''
    const runId = id.startsWith('run:') ? id.slice(4) : r.runOf(id)
    if (type === 'action' && extra?.actionId === 'stop') { if (runId) r.stop(runId); return }
    if (type === 'action' && extra?.actionId === 'show') { if (runId) r.show(runId); return }
    if (type === 'open' && id.startsWith('run:')) return r.show(id.slice(4))
    if ((type === 'action' && extra?.actionId === 'run') || type === 'open') r.runItem(id)
  }
  const actions = <button title={t('Actualiser')} onClick={() => r.load(project.root)}>{Icons.refresh(14)}</button>
  return (
    <Island title={t('Exécuteurs')} icon={Icons.play(14)} actions={actions} grow dataView="run">
      {project.root ? (
        <PanelTabs storeKey="run" tabs={[
          { id: 'scripts', label: t('Scripts'), count: running.length, content: <PluginViewBody model={model} send={send} layoutKey="run:scripts" /> },
          { id: 'tests', label: t('Tests'), content: <Empty>{t('Les tests du projet arrivent ici : détection de Vitest, Jest et pytest à la prochaine étape.')}</Empty> },
        ]} />
      ) : <Empty>{t('Ouvre un projet')}</Empty>}
    </Island>
  )
}
