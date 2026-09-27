import { useEffect, useState } from 'react'
import type { DirEntry } from '@shared/ipc'
import { Icons } from './icons'
import { useWorkbench, type Project } from '@/stores/workbench'

/** Lazy directory tree bounded to `root`. Single click selects (sets the cwd for new tabs), double click opens. */
export function FileTree({ project, root }: { project: Project; root: string }) {
  return (
    <div className="tree">
      <Dir project={project} path={root} depth={0} open />
    </div>
  )
}

function Dir({ project, path, depth, open: initialOpen }: { project: Project; path: string; depth: number; open?: boolean }) {
  const [open, setOpen] = useState(!!initialOpen)
  const [entries, setEntries] = useState<DirEntry[] | null>(null)
  useEffect(() => {
    if (open && entries === null) window.ct.fs.readdir(path).then(setEntries)
  }, [open, path, entries])
  return (
    <>
      {entries?.map((e) => (e.isDir ? <DirRow key={e.path} project={project} entry={e} depth={depth} /> : <FileRow key={e.path} project={project} entry={e} depth={depth} />))}
    </>
  )
}

function DirRow({ project, entry, depth }: { project: Project; entry: DirEntry; depth: number }) {
  const [open, setOpen] = useState(false)
  const select = useWorkbench((s) => s.select)
  const newTab = useWorkbench((s) => s.newTab)
  const sel = project.selectedPath === entry.path
  return (
    <>
      <div className={'row dir' + (sel ? ' sel' : '')} style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => { select(project.id, entry.path, true) }}
        onDoubleClick={() => setOpen(!open)}
        onContextMenu={(e) => { e.preventDefault(); newTab(project.id, 'claude', entry.path) }}
        draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', entry.path); e.dataTransfer.effectAllowed = 'copy' }}
        title={entry.path}>
        <span className={'chev' + (open ? ' open' : '')} onClick={(e) => { e.stopPropagation(); setOpen(!open) }}>{Icons.chevron(10)}</span>
        <span className="ico">{Icons.folder(14)}</span>
        <span style={{ opacity: entry.hidden ? 0.6 : 1 }}>{entry.name}</span>
      </div>
      {open && <Dir project={project} path={entry.path} depth={depth + 1} open />}
    </>
  )
}

function FileRow({ project, entry, depth }: { project: Project; entry: DirEntry; depth: number }) {
  const select = useWorkbench((s) => s.select)
  const openFile = useWorkbench((s) => s.openFile)
  const sel = project.selectedPath === entry.path
  return (
    <div className={'row file' + (sel ? ' sel' : '')} style={{ paddingLeft: 6 + depth * 14 + 19 }}
      onClick={() => select(project.id, entry.path, false)}
      onDoubleClick={() => openFile(project.id, entry.path)}
      draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', entry.path); e.dataTransfer.effectAllowed = 'copy' }}
      title={entry.path}>
      <span className="ico">{Icons.file(14)}</span>
      <span style={{ opacity: entry.hidden ? 0.6 : 1 }}>{entry.name}</span>
    </div>
  )
}
