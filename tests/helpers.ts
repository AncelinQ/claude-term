import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, isAbsolute } from 'node:path'

/** Temporary directory per test, removed on dispose. */
export class TempDir {
  readonly path: string
  constructor() { this.path = mkdtempSync(join(tmpdir(), 'claudeterm-')) }
  write(rel: string, content: string): string {
    const p = isAbsolute(rel) ? rel : join(this.path, rel)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, content)
    return p
  }
  dispose() { rmSync(this.path, { recursive: true, force: true }) }
}

export const jsonl = (objs: object[]) => objs.map((o) => JSON.stringify(o)).join('\n') + '\n'
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
