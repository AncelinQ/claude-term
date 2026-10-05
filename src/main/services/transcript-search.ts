import { spawn, type ChildProcess } from 'node:child_process'
import { rgPath } from './search'
import { accentPattern, matchText, recordText, searchWords } from '@shared/transcript-search'

export interface TextHit { role: 'user' | 'assistant'; snippet: string; time?: string }
export interface TextResult { path: string; hits: TextHit[] }

/**
 * Searches every transcript for the query's words (accents and case aside), without an index: ripgrep goes through the
 * projects folder on the longest word, each matching line is read and kept when a prompt or Claude's text holds every
 * word. A new search stops the one running.
 */
export class TranscriptSearch {
  private current: ChildProcess | null = null
  constructor(private root: string) {}

  search(query: string, maxSessions = 40, hitsPerSession = 3): Promise<TextResult[]> {
    this.current?.kill()
    const words = searchWords(query)
    const rg = rgPath()
    if (!words.length || !rg) return Promise.resolve([])
    const longest = [...words].sort((a, b) => b.length - a.length)[0]
    const args = ['--json', '--ignore-case', '--max-count', '50', '--glob', '*.jsonl', '--glob', '!**/subagents/**', '--regexp', accentPattern(longest), '--', this.root]
    return new Promise((resolve) => {
      const p = spawn(rg, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
      this.current = p
      const byPath = new Map<string, TextHit[]>()
      let rest = ''
      const take = (json: string) => {
        if (!json.includes('"type":"match"')) return
        let m: any
        try { m = JSON.parse(json) } catch { return }
        const path: string | undefined = m.data?.path?.text, line: string | undefined = m.data?.lines?.text
        if (!path || !line) return
        const hits = byPath.get(path) ?? []
        if (hits.length >= hitsPerSession) return
        let o: any
        try { o = JSON.parse(line) } catch { return }
        const r = recordText(o)
        const snippet = r && matchText(r.text, words)
        if (!snippet) return
        hits.push({ role: r!.role, snippet, ...(typeof o.timestamp === 'string' ? { time: o.timestamp } : {}) })
        byPath.set(path, hits)
        if (byPath.size >= maxSessions && [...byPath.values()].every((h) => h.length >= hitsPerSession)) p.kill()
      }
      p.stdout!.setEncoding('utf8').on('data', (chunk: string) => {
        const lines = (rest + chunk).split('\n')
        rest = lines.pop() ?? ''
        for (const l of lines) take(l)
      })
      const done = () => { if (this.current === p) this.current = null; take(rest); resolve([...byPath].slice(0, maxSessions).map(([path, hits]) => ({ path, hits }))) }
      p.on('close', done)
      p.on('error', () => resolve([]))
    })
  }
}
