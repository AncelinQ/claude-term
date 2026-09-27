import { app, clipboard, nativeImage } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'

/** Dropped, pasted or captured images become files under userData/drops; their path is typed into the prompt. */
export class Attachments {
  readonly dir: string
  constructor(base = app.getPath('userData')) {
    this.dir = join(base, 'drops')
    mkdirSync(this.dir, { recursive: true })
  }
  newPath(ext = 'png'): string {
    const d = new Date(), p = (n: number) => String(n).padStart(2, '0')
    return join(this.dir, `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`)
  }
  /** Saves a data URL (image/*) and returns the file path. */
  saveDataUrl(dataUrl: string): string | null {
    const m = dataUrl.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/s)
    if (!m) return null
    const p = this.newPath(m[1] === 'jpeg' ? 'jpg' : m[1])
    writeFileSync(p, Buffer.from(m[2], 'base64'))
    return p
  }
  /** Clipboard image (when the clipboard holds no text) saved as PNG. Electron 44: async W3C-style API. */
  async clipboardImage(): Promise<string | null> {
    if ((await clipboard.readText()).trim()) return null
    for (const item of await clipboard.read()) {
      const type = item.types.find((x) => x.startsWith('image/'))
      if (!type) continue
      const blob = (await item.getType(type)) as Blob
      const buf = Buffer.from(await blob.arrayBuffer())
      const png = type === 'image/png' ? buf : nativeImage.createFromBuffer(buf).toPNG()
      const p = this.newPath()
      writeFileSync(p, png)
      return p
    }
    return null
  }
  /** Interactive screen capture (macOS: screencapture -i). Resolves with the file, or null when cancelled. */
  captureScreen(): Promise<string | null> {
    return new Promise((resolve) => {
      if (process.platform !== 'darwin') return resolve(null)
      const p = this.newPath()
      execFile('/usr/sbin/screencapture', ['-i', '-r', p], () => resolve(existsSync(p) ? p : null))
    })
  }
  static isImage(p: string) { return /\.(png|jpe?g|gif|webp|bmp)$/i.test(p) }
  static preview(p: string) { return nativeImage.createFromPath(p) }
}
