import type { ReactNode } from 'react'
import type { ViewModel } from '@shared/plugins'
import { Icons } from './icons'
import { fixPrompt, problemsTree, todoPrompt, todosTree } from '@shared/problems'
import { PluginViewBody, type Send } from './PluginView'
import { useProblems } from '@/stores/problems'
import { useWorkbench, type Project } from '@/stores/workbench'
import { t } from '@/i18n'


/**
 * Errors tab of the center bottom block: the project's tsc / ESLint problems by file; a click opens the line, "Corriger
 * avec Claude" (a problem or a whole file) types the list in the Claude tab without sending it.
 */
export function ErrorsView({ project }: { project: Project }) {
  const { diagnostics, tools, checking } = useProblems()
  const root = project.root ?? ''
  const model: ViewModel = !tools ? { kind: 'empty', text: t('Vérification en cours…') }
    : !tools.length ? { kind: 'empty', text: t('Aucun vérificateur dans ce projet : ni TypeScript (tsconfig) ni ESLint installés.') }
    : !diagnostics.length ? { kind: 'empty', text: t('Aucune erreur') }
    : { kind: 'tree', search: true, items: problemsTree(diagnostics, root) }
  const send: Send = (type, extra) => {
    const id = extra?.itemId ?? ''
    const list = id.startsWith('perr:') ? [diagnostics[+id.slice(5)]] : id.startsWith('pfile:') ? diagnostics.filter((d) => d.file === id.slice(6)) : []
    if (!list.length || !list[0]) return
    if (type === 'action' && extra?.actionId === 'fix') return useWorkbench.getState().insertPrompt(project.id, fixPrompt(list, root))
    if ((type === 'select' || type === 'open') && id.startsWith('perr:')) useWorkbench.getState().openFile(project.id, list[0].file, list[0].line)
  }
  const status = checking ? t('Vérification…') : tools?.length ? summary(tools) : ''
  return <Status text={status} busy={checking} onRefresh={() => useProblems.getState().load(project.root)}><PluginViewBody model={model} send={send} layoutKey="bottom:errors" /></Status>
}

/** TODO tab: TODO / FIXME / HACK / XXX of the project by file; "Demander à Claude" types the point in the Claude tab */
export function TodoView({ project }: { project: Project }) {
  const todos = useProblems((s) => s.todos)
  const root = project.root ?? ''
  const model: ViewModel = !todos.length ? { kind: 'empty', text: t('Aucun TODO, FIXME, HACK ni XXX dans le projet.') }
    : { kind: 'tree', search: true, items: todosTree(todos, root) }
  const send: Send = (type, extra) => {
    const id = extra?.itemId ?? ''
    const todo = id.startsWith('todo:') ? todos[+id.slice(5)] : undefined
    if (!todo) return
    if (type === 'action' && extra?.actionId === 'ask') return useWorkbench.getState().insertPrompt(project.id, todoPrompt(todo, root))
    if (type === 'select' || type === 'open') useWorkbench.getState().openFile(project.id, todo.file, todo.line)
  }
  return <Status text={t('{n} élément(s)', { n: todos.length })} onRefresh={() => useProblems.getState().load(project.root)}><PluginViewBody model={model} send={send} layoutKey="bottom:todo" /></Status>
}

function summary(tools: { tool: string; config?: string; ok: boolean; error?: string }[]): string {
  const names = [...new Set(tools.map((x) => (x.tool === 'tsc' ? 'TypeScript' : 'ESLint')))].join(' + ')
  const failed = tools.find((x) => !x.ok)
  return failed ? `${names} · ${failed.tool} : ${failed.error}` : names
}

/** a status line (what was checked, or "Vérification…") with a refresh button, above the list */
function Status({ text, busy, onRefresh, children }: { text: string; busy?: boolean; onRefresh: () => void; children: ReactNode }) {
  return (
    <div className="pb-view">
      <div className="pb-status"><span>{text}</span><button title={t('Revérifier')} onClick={onRefresh} disabled={busy}>{busy ? <span className="spin" /> : Icons.refresh(13)}</button></div>
      {children}
    </div>
  )
}
