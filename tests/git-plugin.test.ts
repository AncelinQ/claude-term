import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { TempDir } from './helpers'

const require = createRequire(import.meta.url)
const { parseStatus, parseLog, parseBranches, LOG_FORMAT } = require('../resources/plugins/git/git.js')

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', HOME: cwd } })

describe('git plugin parsers against a real repository', () => {
  it('status v2: staged, unstaged, untracked, renamed, branch and ahead/behind', () => {
    const t = new TempDir()
    const r = t.path
    git(r, 'init', '-q', '-b', 'main')
    t.write('a.txt', 'a\n'); t.write('b.txt', 'b\n'); t.write('c.txt', 'c\n')
    git(r, 'add', '.'); git(r, 'commit', '-q', '-m', 'first')
    t.write('a.txt', 'a2\n')                  // unstaged modification
    t.write('b.txt', 'b2\n'); git(r, 'add', 'b.txt')   // staged modification
    t.write('new.txt', 'n\n')                 // untracked
    git(r, 'mv', 'c.txt', 'd.txt')            // staged rename
    const s = parseStatus(git(r, 'status', '--porcelain=v2', '--branch', '-z'))
    expect(s.branch).toBe('main')
    expect(s.detached).toBe(false)
    const by = Object.fromEntries(s.entries.map((e: any) => [e.path, e]))
    expect(by['a.txt']).toMatchObject({ staged: null, unstaged: 'M', untracked: false })
    expect(by['b.txt']).toMatchObject({ staged: 'M', unstaged: null })
    expect(by['new.txt']).toMatchObject({ untracked: true })
    expect(by['d.txt']).toMatchObject({ staged: 'R', from: 'c.txt' })
    // log and branches
    git(r, 'commit', '-q', '-m', 'second')
    const log = parseLog(git(r, 'log', '--format=' + LOG_FORMAT))
    expect(log.map((c: any) => c.subject)).toEqual(['second', 'first'])
    expect(log[0].author).toBe('T'); expect(log[0].hash).toHaveLength(40); expect(log[0].short.length).toBeGreaterThanOrEqual(7)
    git(r, 'branch', 'feature')
    expect(parseBranches(git(r, 'branch', '--format=%(HEAD)%(refname:short)'))).toEqual([{ name: 'feature', current: false }, { name: 'main', current: true }])
    t.dispose()
  })
  it('detached head and conflict entries', () => {
    const t = new TempDir(); const r = t.path
    git(r, 'init', '-q', '-b', 'main'); t.write('f.txt', '1\n'); git(r, 'add', '.'); git(r, 'commit', '-q', '-m', 'one')
    git(r, 'checkout', '-q', '-b', 'other'); t.write('f.txt', 'other\n'); git(r, 'commit', '-q', '-am', 'o')
    git(r, 'checkout', '-q', 'main'); t.write('f.txt', 'main\n'); git(r, 'commit', '-q', '-am', 'm')
    try { git(r, 'merge', 'other') } catch { /* conflict expected */ }
    const s = parseStatus(git(r, 'status', '--porcelain=v2', '--branch', '-z'))
    expect(s.entries.find((e: any) => e.path === 'f.txt')?.conflict).toBe(true)
    git(r, 'merge', '--abort')
    git(r, 'checkout', '-q', '--detach')
    expect(parseStatus(git(r, 'status', '--porcelain=v2', '--branch', '-z')).detached).toBe(true)
    expect(parseStatus('').entries).toEqual([])
    t.dispose()
  })
})
