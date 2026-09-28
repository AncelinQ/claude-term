import { describe, it, expect } from 'vitest'
import { fixPrompt, parseEslintJson, parseTscOutput, problemsTree, scanTodos, todoPrompt, todosTree } from '../src/shared/problems'

describe('checkers output', () => {
  it('reads tsc --pretty false', () => {
    const out = [
      "src/a.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.",
      "  Type 'x' is missing the following properties",
      '/abs/b.tsx(3,1): error TS2304: Cannot find name \'foo\'.',
      'Found 2 errors.',
    ].join('\n')
    expect(parseTscOutput(out, '/p')).toEqual([
      { file: '/p/src/a.ts', line: 12, col: 5, severity: 'error', code: 'TS2322', message: "Type 'string' is not assignable to type 'number'.\nType 'x' is missing the following properties", source: 'tsc' },
      { file: '/abs/b.tsx', line: 3, col: 1, severity: 'error', code: 'TS2304', message: "Cannot find name 'foo'.", source: 'tsc' },
    ])
    expect(parseTscOutput('', '/p')).toEqual([])
  })
  it('reads eslint -f json', () => {
    const out = JSON.stringify([{ filePath: '/p/a.ts', messages: [{ line: 2, column: 7, severity: 2, message: "'x' is unused", ruleId: 'no-unused-vars' }, { line: 9, column: 1, severity: 1, message: 'Unexpected console', ruleId: 'no-console' }, { severity: 0, message: 'off' }] }, { filePath: '/p/b.ts', messages: [] }])
    expect(parseEslintJson(out)).toEqual([
      { file: '/p/a.ts', line: 2, col: 7, severity: 'error', message: "'x' is unused", source: 'eslint', code: 'no-unused-vars' },
      { file: '/p/a.ts', line: 9, col: 1, severity: 'warning', message: 'Unexpected console', source: 'eslint', code: 'no-console' },
    ])
    expect(parseEslintJson('oops')).toEqual([])
    expect(parseEslintJson('{}')).toEqual([])
  })
})

describe('todo markers', () => {
  it('finds TODO / FIXME / HACK / XXX in comments and Markdown, not in identifiers', () => {
    const src = ['// TODO: split this', 'const TODO_LIST = []', '/* FIXME(jerome) wrong on Windows */', '  # HACK - until the API is fixed', 'x = 1 // XXX', '<!-- TODO document -->', 'let todo = "TODO later"'].join('\n')
    expect(scanTodos(src, '/p/a.ts')).toEqual([
      { file: '/p/a.ts', line: 1, tag: 'TODO', text: 'split this' },
      { file: '/p/a.ts', line: 3, tag: 'FIXME', text: 'wrong on Windows' },
      { file: '/p/a.ts', line: 4, tag: 'HACK', text: 'until the API is fixed' },
      { file: '/p/a.ts', line: 5, tag: 'XXX', text: '' },
      { file: '/p/a.ts', line: 6, tag: 'TODO', text: 'document' },
    ])
    expect(scanTodos('- [ ] TODO relire\nTexte avec TODO au milieu', '/p/notes.md').map((t) => t.line)).toEqual([1, 2])
  })
})

describe('trees and prompts', () => {
  const diags = [
    { file: '/p/src/w.ts', line: 9, col: 1, severity: 'warning' as const, message: 'Unexpected console', source: 'eslint' as const, code: 'no-console' },
    { file: '/p/src/a.ts', line: 12, col: 5, severity: 'error' as const, message: 'Bad type\nmore', source: 'tsc' as const, code: 'TS2322' },
    { file: '/p/src/a.ts', line: 2, col: 1, severity: 'error' as const, message: 'Unknown', source: 'tsc' as const, code: 'TS2304' },
  ]
  it('groups problems by file, files with errors first, lines in order', () => {
    const tree = problemsTree(diags, '/p')
    expect(tree.map((f) => [f.label, f.extra])).toEqual([['src/a.ts', '2 ✗'], ['src/w.ts', '1 ⚠']])
    expect(tree[0].children!.map((c) => [c.label, c.detail, c.icon])).toEqual([['2:1  Unknown', 'tsc TS2304', 'x'], ['12:5  Bad type', 'tsc TS2322', 'x']])
    expect(tree[1].children![0]).toMatchObject({ icon: 'info', color: 'badge.warn' })
  })
  it('groups todos by file', () => {
    const tree = todosTree([{ file: '/p/b.ts', line: 3, tag: 'FIXME', text: 'x' }, { file: '/p/a.md', line: 1, tag: 'TODO', text: '' }], '/p')
    expect(tree.map((f) => [f.label, f.extra, f.children!.map((c) => c.label)])).toEqual([['a.md', '1', ['1  TODO']], ['b.ts', '1', ['3  x']]])
  })
  it('writes the prompts for Claude', () => {
    expect(fixPrompt([diags[1]], '/p')).toBe('Corrige cette erreur de src/a.ts :\n- src/a.ts:12:5 (tsc TS2322) Bad type more\n\nCorrige la cause (pas seulement le symptôme), puis revérifie.')
    expect(fixPrompt(diags, '/p')).toMatch(/^Corrige ces 3 erreurs :\n- src\/w.ts:9:1 \(eslint no-console\)/)
    expect(todoPrompt({ file: '/p/a.ts', line: 4, tag: 'TODO', text: 'split' }, '/p')).toBe("Dans a.ts, ligne 4 : « TODO split ». Traite ce point, ou dis-moi ce qu'il faut décider avant.")
  })
})
