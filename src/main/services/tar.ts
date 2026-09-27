import { gunzipSync } from 'node:zlib'
import { posix } from 'node:path'

export interface TarFile { path: string; data: Buffer }
export interface TarLimits { maxBytes: number; maxFiles: number }

/**
 * Reads a .tgz into memory: regular files only (folders are implied by paths), ustar + pax + GNU long
 * names. Refuses links, special files, absolute or `..` paths and archives over the limits.
 */
export function readTarGz(gz: Buffer, limits: TarLimits): TarFile[] {
  let buf: Buffer
  try { buf = gunzipSync(gz, { maxOutputLength: limits.maxBytes + 1024 * 1024 }) } catch (e) {
    throw new Error((e as any)?.code === 'ERR_BUFFER_TOO_LARGE' ? 'archive trop grande' : 'archive .tgz illisible')
  }
  const files: TarFile[] = []
  let total = 0
  let longName: string | null = null
  let pax: Record<string, string> = {}
  for (let off = 0; off + 512 <= buf.length;) {
    const h = buf.subarray(off, off + 512)
    if (h.every((b) => b === 0)) break
    if (!checksumOk(h)) throw new Error('archive .tgz corrompue')
    const type = String.fromCharCode(h[156] || 48)
    const size = pax.size !== undefined ? Number(pax.size) : octal(h.subarray(124, 136))
    if (!Number.isSafeInteger(size) || size < 0) throw new Error('archive .tgz corrompue')
    const dataStart = off + 512
    if (dataStart + size > buf.length) throw new Error('archive .tgz tronquée')
    const data = buf.subarray(dataStart, dataStart + size)
    off = dataStart + Math.ceil(size / 512) * 512
    if (type === 'x') { pax = parsePax(data); continue }
    if (type === 'g' || type === 'K') continue
    if (type === 'L') { longName = cstr(data); continue }
    const prefix = cstr(h.subarray(345, 500))
    const raw = pax.path ?? longName ?? (prefix ? prefix + '/' : '') + cstr(h.subarray(0, 100))
    longName = null; pax = {}
    if (type === '5') { safePath(raw); continue }
    if (type !== '0' && type !== '7') throw new Error(`« ${raw} » : liens et fichiers spéciaux refusés`)
    const path = safePath(raw)
    if (posix.basename(path).startsWith('._') || path.split('/')[0] === '__MACOSX') continue
    total += size
    if (total > limits.maxBytes) throw new Error('archive trop grande')
    if (files.length >= limits.maxFiles) throw new Error('trop de fichiers dans l\'archive')
    files.push({ path, data: Buffer.from(data) })
  }
  return files
}

/** Relative posix path without `.` segments; throws on absolute, drive or `..` paths. */
export function safePath(raw: string): string {
  const p = raw.replace(/\\/g, '/')
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p) || p.split('/').includes('..')) throw new Error(`chemin refusé dans l'archive : ${raw}`)
  const norm = posix.normalize(p).replace(/\/+$/, '')
  return norm === '.' ? '' : norm.replace(/^\.\//, '')
}

/** When plugin.json is not at the root, strips a single top folder that holds it (GitHub archives). */
export function stripTopFolder(files: TarFile[]): TarFile[] {
  if (files.some((f) => f.path === 'plugin.json')) return files
  const tops = new Set(files.map((f) => f.path.split('/')[0]))
  if (tops.size !== 1) return files
  const top = [...tops][0] + '/'
  if (!files.some((f) => f.path === top + 'plugin.json')) return files
  return files.map((f) => ({ ...f, path: f.path.slice(top.length) }))
}

const cstr = (b: Buffer) => { const i = b.indexOf(0); return b.subarray(0, i < 0 ? b.length : i).toString('utf8') }
const octal = (b: Buffer) => { if (b[0] & 0x80) return NaN; const s = cstr(b).trim(); return s ? parseInt(s, 8) : 0 }

function checksumOk(h: Buffer): boolean {
  let sum = 0
  for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : h[i]
  return sum === octal(h.subarray(148, 156))
}

function parsePax(data: Buffer): Record<string, string> {
  const out: Record<string, string> = {}
  let i = 0
  while (i < data.length) {
    const sp = data.indexOf(32, i)
    if (sp < 0) break
    const len = parseInt(data.subarray(i, sp).toString(), 10)
    if (!len) break
    const rec = data.subarray(sp + 1, i + len - 1).toString('utf8')
    const eq = rec.indexOf('=')
    if (eq > 0) out[rec.slice(0, eq)] = rec.slice(eq + 1)
    i += len
  }
  return out
}
