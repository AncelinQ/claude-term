import { describe, it, expect } from 'vitest'
import {
  printArgs, parsePrintOutput, unfence, extractMermaid, sessionDigest, diagramInstructions, commitInstructions, mrInstructions, skillInstructions,
  RUN_BUDGET_USD, DIGEST_MAX,
} from '../src/shared/claude-run'

describe('isolated claude -p', () => {
  it('runs with no tool, MCP, settings nor kept session, capped, the instructions as system prompt', () => {
    const a = printArgs('Fais ceci.', 'sonnet')
    expect(a.slice(0, 4)).toEqual(['-p', '--output-format', 'json', '--no-session-persistence'])
    expect(a).toEqual(expect.arrayContaining(['--strict-mcp-config']))
    expect(a[a.indexOf('--tools') + 1]).toBe('')
    expect(a[a.indexOf('--setting-sources') + 1]).toBe('')
    expect(a[a.indexOf('--max-budget-usd') + 1]).toBe(String(RUN_BUDGET_USD))
    expect(a.slice(-2)).toEqual(['--system-prompt', 'Fais ceci.'])
    expect(printArgs('x')[printArgs('x').indexOf('--model') + 1]).toBe('sonnet')
  })

  it('reads the answer, its cost and model; says why it gave nothing', () => {
    expect(parsePrintOutput(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'feat: x', total_cost_usd: 0.031, modelUsage: { 'claude-sonnet-5-5': {} } })))
      .toEqual({ text: 'feat: x', costUsd: 0.031, model: 'claude-sonnet-5-5' })
    expect(parsePrintOutput(JSON.stringify({ subtype: 'success', result: 'ok' }))).toEqual({ text: 'ok' })
    expect(() => parsePrintOutput(JSON.stringify({ subtype: 'error_max_budget_usd', is_error: true, result: '' }))).toThrow(/error_max_budget_usd/)
    expect(() => parsePrintOutput(JSON.stringify({ subtype: 'success', is_error: true, result: 'Invalid API key' }))).toThrow('Invalid API key')
    expect(() => parsePrintOutput(JSON.stringify({ is_error: false }))).toThrow(/inconnu/)
    expect(() => parsePrintOutput('Not logged in')).toThrow('Not logged in')
    expect(() => parsePrintOutput('')).toThrow(/illisible/)
  })

  it('takes a wrapping code block off, finds the Mermaid source', () => {
    expect(unfence('```\nfeat: x\n\nbody\n```')).toBe('feat: x\n\nbody')
    expect(unfence('  plain  ')).toBe('plain')
    expect(extractMermaid('Voici :\n```mermaid\nflowchart LR\n  a --> b\n```\n')).toBe('flowchart LR\n  a --> b')
    expect(extractMermaid('graph TD\n a-->b')).toBe('graph TD\n a-->b')
    expect(extractMermaid('Pas de schéma.')).toBeUndefined()
  })

  it("digests a session: requests, changed files with their counts, diffs each cut to its share", () => {
    const d = sessionDigest({
      title: 'Groupes d\'onglets',
      prompts: ['ajoute   les groupes', 'x'.repeat(700)],
      changes: [
        { path: 'src/a.ts', unified: '--- a\n+++ b\n+x\n+y\n-z' },
        { path: 'src/new.ts', unified: '+n', created: true },
        { path: 'old.ts', unified: '', deleted: true },
        { path: 'same.ts', unified: '' },
      ],
    })
    expect(d.text).toContain('# Session\nGroupes d\'onglets')
    expect(d.text).toContain('1. ajoute les groupes')
    expect(d.text).toContain('- src/a.ts +2 -1\n- src/new.ts (créé) +1 -0\n- old.ts (supprimé) +0 -0')
    expect(d.text).not.toContain('same.ts')
    expect(d.text).toContain('# Diffs\n--- a')
    expect(d.truncated).toBe(true)   // the long request was cut
    // a small budget: requests stop, diffs are cut or left out
    const tight = sessionDigest({ prompts: Array.from({ length: 50 }, (_, i) => 'demande ' + i), changes: Array.from({ length: 30 }, (_, i) => ({ path: `f${i}`, unified: 'y'.repeat(5000) })) }, 4000)
    expect(tight.truncated).toBe(true)
    expect(tight.text.length).toBeLessThan(4000 + 400)
    expect(sessionDigest({ prompts: [], changes: [] })).toEqual({ text: '', truncated: false })
    expect(sessionDigest({ prompts: ['a'], changes: [{ path: 'p', unified: 'z'.repeat(100) }] }, DIGEST_MAX).truncated).toBe(false)
  })

  it('instructions in the interface language; a commit follows the repository', () => {
    expect(diagramInstructions('fr')).toMatch(/```mermaid/)
    expect(diagramInstructions('en')).toMatch(/English/)
    expect(commitInstructions(['feat(x): a', 'fix: b'])).toContain('- feat(x): a\n- fix: b')
    expect(commitInstructions([])).toMatch(/Conventional Commits/)
    expect(mrInstructions('fr')).toMatch(/## Pourquoi/)
    expect(mrInstructions('en')).toMatch(/## Why/)
    expect(skillInstructions('fr')).toMatch(/front matter/)
    expect(skillInstructions('en')).toMatch(/Use when/)
  })
})
