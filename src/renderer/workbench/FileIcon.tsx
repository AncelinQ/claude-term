/** File and folder icons from the Material Icon Theme (VS Code), bundled as SVG assets. */
import mapping from 'material-icon-theme/dist/material-icons.json'

// relative glob: the renderer's Vite root is src/renderer
const urls = import.meta.glob('../../../node_modules/material-icon-theme/icons/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const byName: Record<string, string> = {}
for (const [k, v] of Object.entries(urls)) byName[k.slice(k.lastIndexOf('/') + 1, -4)] = v
const urlOf = (name: string) => byName[name]
const m = mapping as unknown as { fileExtensions: Record<string, string>; fileNames: Record<string, string>; folderNames: Record<string, string>; folderNamesExpanded: Record<string, string>; file: string; folder: string; folderExpanded: string }

export function iconNameFor(path: string, isDir = false, open = false): string {
  const name = (path.split(/[\\/]/).pop() ?? path).toLowerCase()
  if (isDir) return (open ? m.folderNamesExpanded[name] : m.folderNames[name]) ?? (open ? m.folderExpanded : m.folder)
  if (m.fileNames[name]) return m.fileNames[name]
  const parts = name.split('.')
  for (let i = 1; i < parts.length; i++) { const ext = parts.slice(i).join('.'); if (m.fileExtensions[ext]) return m.fileExtensions[ext] }
  return m.file
}

export function FileIcon({ path, isDir, open, size = 16 }: { path: string; isDir?: boolean; open?: boolean; size?: number }) {
  const url = urlOf(iconNameFor(path, isDir, open)) ?? urlOf(isDir ? m.folder : m.file)
  return <img className="ficon" src={url} width={size} height={size} alt="" draggable={false} />
}
