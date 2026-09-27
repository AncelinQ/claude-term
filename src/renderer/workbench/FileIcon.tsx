/** File and folder icons from Catppuccin (MIT): Mocha for dark themes, Latte for light ones. */
import mapping from '@/assets/catppuccin/mapping.json'
import { useWorkbench } from '@/stores/workbench'

const mocha = import.meta.glob('../assets/catppuccin/mocha/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const latte = import.meta.glob('../assets/catppuccin/latte/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const index = (g: Record<string, string>) => { const o: Record<string, string> = {}; for (const [k, v] of Object.entries(g)) o[k.slice(k.lastIndexOf('/') + 1, -4)] = v; return o }
const FLAVORS = { dark: index(mocha), light: index(latte) }
const m = mapping as { fileExtensions: Record<string, string>; fileNames: Record<string, string>; folderNames: Record<string, string> }

export function iconNameFor(path: string, isDir = false, open = false): string {
  const name = (path.split(/[\\/]/).pop() ?? path).toLowerCase()
  if (isDir) { const f = m.folderNames[name] ?? '_folder'; return open ? f + '_open' : f }
  if (m.fileNames[name]) return m.fileNames[name]
  const parts = name.split('.')
  for (let i = 1; i < parts.length; i++) { const ext = parts.slice(i).join('.'); if (m.fileExtensions[ext]) return m.fileExtensions[ext] }
  return '_file'
}

export function FileIcon({ path, isDir, open, size = 16 }: { path: string; isDir?: boolean; open?: boolean; size?: number }) {
  const type = useWorkbench((s) => s.theme?.type ?? 'dark')
  const set = FLAVORS[type]
  const url = set[iconNameFor(path, isDir, open)] ?? set[isDir ? (open ? '_folder_open' : '_folder') : '_file']
  return <img className="ficon" src={url} width={size} height={size} alt="" draggable={false} />
}
