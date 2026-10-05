import { describe, it, expect } from 'vitest'
import { TempDir } from './helpers'
import { ClaudeRunner } from '../src/main/services/claude-run'

/** A stand-in for claude: echoes its stdin and arguments back as claude -p's JSON answer. */
const FAKE = `let s = ''; process.stdin.on('data', (c) => s += c); process.stdin.on('end', () => {
  const a = process.argv.slice(2)
  if (s === 'fail') { process.stderr.write('Not logged in'); process.exit(1) }
  if (s === 'slow') return setTimeout(() => {}, 10000)
  process.stdout.write(JSON.stringify({ subtype: 'success', result: s.toUpperCase() + '|' + a[a.indexOf('--system-prompt') + 1] + '|' + (process.env.CLAUDE_CODE_X ?? 'none'), total_cost_usd: 0.02, modelUsage: { 'claude-sonnet-5-5': {} } }))
})`

describe('claude -p runner', () => {
  it('sends the input on stdin, reads the answer, keeps Claude Code variables out', async () => {
    const t = new TempDir()
    const script = t.write('fake.js', FAKE)
    process.env.CLAUDE_CODE_X = 'leak'
    const r = new ClaudeRunner((args) => ({ file: process.execPath, args: [script, ...args], env: { ELECTRON_RUN_AS_NODE: '1' } }), () => process.env, t.path)
    expect(await r.run('diff', { instructions: 'Écris.' })).toEqual({ text: 'DIFF|Écris.|none', costUsd: 0.02, model: 'claude-sonnet-5-5' })
    delete process.env.CLAUDE_CODE_X
    await expect(r.run('fail', { instructions: 'x' })).rejects.toThrow('Not logged in')
    t.dispose()
  }, 20_000)

  it('one run per key: a second asks the same one; a timeout stops it; no claude, an error', async () => {
    const t = new TempDir()
    const script = t.write('fake.js', FAKE)
    const r = new ClaudeRunner((args) => ({ file: process.execPath, args: [script, ...args], env: { ELECTRON_RUN_AS_NODE: '1' } }), () => process.env, t.path, 1500)
    const a = r.run('a', { instructions: 'x', key: 'k' }), b = r.run('b', { instructions: 'x', key: 'k' })
    expect(b).toBe(a)
    expect((await a).text).toBe('A|x|none')
    await expect(r.run('slow', { instructions: 'x' })).rejects.toThrow(/arrêté|illisible/)
    await expect(new ClaudeRunner(() => null, () => process.env, t.path).run('x', { instructions: 'y' })).rejects.toThrow(/introuvable/)
    t.dispose()
  }, 20_000)
})
