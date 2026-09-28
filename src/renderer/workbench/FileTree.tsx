import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { DirEntry } from '@shared/ipc'
import { Icons } from './icons'
import { FileIcon } from './FileIcon'
import { useWorkbench, type Project } from '@/stores/workbench'
import { ContextMenu } from './Menu'
import { t as tr } from '@/i18n'

const mac = window.ct.platform === 'darwin'

/** open folders of the tree, shared so the keyboard can open / close them */
const OpenDirs = createContext<{ isOpen(p: string): boolean; setOpen(p: string, open: boolean): void }>({ isOpen: () => false, setOpen: () => {} })

/**
 * Lazy directory tree bounded to `root`. Single click selects (sets the cwd for new tabs), double click opens.
 * Keyboard (the tree takes focus on click): ↑ ↓ move, → opens a folder / goes into it, ← closes it / goes to its
 * parent, Enter opens a file or toggles a folder, Space is Quick Look (macOS).
 */
export function FileTree({ project, root }: { project: Project; root: string }) {
  const [open, setOpenSet] = useState<Set<string>>(() => new Set())
  const ref = useRef<HTMLDivElement>(null)
  const select = useWorkbench((s) => s.select)
  const openFile = useWorkbench((s) => s.openFile)
  const ctx = { isOpen: (p: string) => open.has(p), setOpen: (p: string, on: boolean) => setOpenSet((s) => { const n = new Set(s); if (on) n.add(p); else n.delete(p); return n }) }
  const rows = () => [...(ref.current?.querySelectorAll<HTMLElement>('.row[data-path]') ?? [])]
  const parentOf = (p: string) => p.replace(/[\\/][^\\/]*$/, '')

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const list = rows()
    const cur = project.selectedPath
    const i = list.findIndex((r) => r.dataset.path === cur)
    const at = i >= 0 ? list[i] : null
    const isDir = at?.dataset.dir === '1'
    const go = (r: HTMLElement | undefined) => { if (!r) return; select(project.id, r.dataset.path!, r.dataset.dir === '1'); r.scrollIntoView({ block: 'nearest' }) }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); go(i < 0 ? list[0] : list[i + 1]); break
      case 'ArrowUp': e.preventDefault(); go(i < 0 ? list[0] : list[Math.max(0, i - 1)]); break
      case 'ArrowRight':
        e.preventDefault()
        if (at && isDir) { if (!ctx.isOpen(cur!)) ctx.setOpen(cur!, true); else go(/^[\\/]/.test(list[i + 1]?.dataset.path?.slice(cur!.length) ?? '') && list[i + 1]?.dataset.path?.startsWith(cur!) ? list[i + 1] : undefined) }
        break
      case 'ArrowLeft': {
        e.preventDefault()
        if (at && isDir && ctx.isOpen(cur!)) { ctx.setOpen(cur!, false); break }
        const parent = cur ? list.find((r) => r.dataset.path === parentOf(cur)) : undefined
        go(parent)
        break
      }
      case 'Enter':
        e.preventDefault()
        if (at && isDir) ctx.setOpen(cur!, !ctx.isOpen(cur!))
        else if (at) openFile(project.id, cur!)
        break
      case ' ':
        if (mac && cur) { e.preventDefault(); window.ct.app.quickLook(cur) }
        break
    }
  }
  return (
    <OpenDirs.Provider value={ctx}>
      <div className="tree" tabIndex={0} ref={ref} onKeyDown={onKeyDown}>
        <Dir key={root} project={project} path={root} depth={0} />
      </div>
    </OpenDirs.Provider>
  )
}

function Dir({ project, path, depth }: { project: Project; path: string; depth: number }) {
  const [entries, setEntries] = useState<DirEntry[] | null>(null)
  useEffect(() => { if (entries === null) window.ct.fs.readdir(path).then(setEntries) }, [path, entries])
  return (
    <>
      {entries?.map((e) => (e.isDir ? <DirRow key={e.path} project={project} entry={e} depth={depth} /> : <FileRow key={e.path} project={project} entry={e} depth={depth} />))}
    </>
  )
}

function DirRow({ project, entry, depth }: { project: Project; entry: DirEntry; depth: number }) {
  const { isOpen, setOpen } = useContext(OpenDirs)
  const open = isOpen(entry.path)
  const select = useWorkbench((s) => s.select)
  const newTab = useWorkbench((s) => s.newTab)
  const sel = project.selectedPath === entry.path
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  return (
    <>
      <ContextMenu at={menu} onClose={() => setMenu(null)} items={[
        { label: tr('Nouvel onglet Claude ici'), icon: Icons.claude(13), onSelect: () => newTab(project.id, 'claude', entry.path) },
        { label: tr('Nouveau shell ici'), icon: Icons.terminal(13), onSelect: () => newTab(project.id, 'shell', entry.path) },
        'sep',
        ...(mac ? [{ label: tr("Coup d'œil"), shortcut: tr('Espace'), onSelect: () => window.ct.app.quickLook(entry.path) }] : []),
        { label: tr(mac ? 'Afficher dans le Finder' : "Afficher dans l'explorateur"), onSelect: () => window.ct.app.revealInFinder(entry.path) },
        { label: tr('Copier le chemin'), onSelect: () => navigator.clipboard.writeText(entry.path) },
      ]} />
      <div className={'row dir' + (sel ? ' sel' : '')} style={{ paddingLeft: 6 + depth * 14 }} data-path={entry.path} data-dir="1"
        onClick={() => { select(project.id, entry.path, true) }}
        onDoubleClick={() => setOpen(entry.path, !open)}
        onContextMenu={(e) => { e.preventDefault(); select(project.id, entry.path, true); setMenu({ x: e.clientX, y: e.clientY }) }}
        draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', entry.path); e.dataTransfer.effectAllowed = 'copy' }}
        title={entry.path}>
        <span className={'chev' + (open ? ' open' : '')} onClick={(e) => { e.stopPropagation(); setOpen(entry.path, !open) }}>{Icons.chevron(10)}</span>
        <FileIcon path={entry.path} isDir open={open} />
        <span style={{ opacity: entry.hidden ? 0.6 : 1 }}>{entry.name}</span>
      </div>
      {open && <Dir project={project} path={entry.path} depth={depth + 1} />}
    </>
  )
}

function FileRow({ project, entry, depth }: { project: Project; entry: DirEntry; depth: number }) {
  const select = useWorkbench((s) => s.select)
  const openFile = useWorkbench((s) => s.openFile)
  const sel = project.selectedPath === entry.path
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  return (
    <>
    <ContextMenu at={menu} onClose={() => setMenu(null)} items={[
      ...(mac ? [{ label: tr("Coup d'œil"), shortcut: tr('Espace'), onSelect: () => window.ct.app.quickLook(entry.path) }, 'sep' as const] : []),
      { label: tr('Ouvrir'), onSelect: () => openFile(project.id, entry.path) },
      { label: tr(mac ? 'Afficher dans le Finder' : "Afficher dans l'explorateur"), onSelect: () => window.ct.app.revealInFinder(entry.path) },
      { label: tr('Copier le chemin'), onSelect: () => navigator.clipboard.writeText(entry.path) },
    ]} />
    <div className={'row file' + (sel ? ' sel' : '')} style={{ paddingLeft: 6 + depth * 14 + 19 }} data-path={entry.path}
      onClick={() => select(project.id, entry.path, false)}
      onDoubleClick={() => openFile(project.id, entry.path)}
      onContextMenu={(e) => { e.preventDefault(); select(project.id, entry.path, false); setMenu({ x: e.clientX, y: e.clientY }) }}
      draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', entry.path); e.dataTransfer.effectAllowed = 'copy' }}
      title={entry.path}>
      <FileIcon path={entry.path} />
      <span style={{ opacity: entry.hidden ? 0.6 : 1 }}>{entry.name}</span>
    </div>
    </>
  )
}
