import { describe, it, expect } from 'vitest'
import { normId, packageScriptLines, runLines } from '../src/shared/run-lines'

describe('package.json run lines', () => {
  it('finds each script key with its line, only in the top-level scripts object', () => {
    const text = `{
  "name": "demo",
  "config": { "scripts": { "not": "this" } },
  "scripts": {
    "dev": "vite",
    "build:prod": "tsc && vite build --mode \\"prod\\"",
    "multi": "echo {not a key}: x"
  },
  "workspaces": ["a"]
}`
    expect(packageScriptLines(text)).toEqual([{ name: 'dev', line: 5 }, { name: 'build:prod', line: 6 }, { name: 'multi', line: 7 }])
  })
  it('compares Lanceur ids across path spellings', () => {
    expect(normId('npm:c:\\proj\\apps\\web:dev')).toBe(normId('npm:C:\\proj\\apps\\web:dev'))
    expect(normId('npm:/p/./packages/a:build')).toBe('npm:/p/packages/a:build')
    expect(normId('npm:/p/app:dev')).toBe('npm:/p/app:dev')
  })
  it('works on a file being edited and without scripts', () => {
    expect(packageScriptLines('{ "scripts": { "a": "x", "b": ')).toEqual([{ name: 'a', line: 1 }, { name: 'b', line: 1 }])
    expect(packageScriptLines('{ "name": "x" }')).toEqual([])
    expect(packageScriptLines('')).toEqual([])
    expect(packageScriptLines('{ "scripts": {} }')).toEqual([])
  })
})

describe('run lines of any file', () => {
  it('package.json scripts, Makefile targets and shell scripts, with the Scripts tab ids', () => {
    expect(runLines('/p/package.json', '{ "scripts": { "dev": "vite" } }')).toEqual([{ line: 1, label: 'dev', command: 'npm run dev', cwd: '/p', itemId: 'npm:/p:dev' }])
    expect(runLines('/p/Makefile', 'all: build\n\tgo\n.PHONY: all\nbuild:\n\techo\nVAR := 1\nall: again\n').map((l) => [l.line, l.label, l.itemId])).toEqual([[1, 'all', 'make:/p:all'], [4, 'build', 'make:/p:build']])
    expect(runLines('/p/deploy.sh', '#!/bin/sh\necho x\n')).toEqual([{ line: 1, label: 'deploy.sh', command: './deploy.sh', cwd: '/p', itemId: 'sh:/p:deploy.sh' }])
    expect(runLines('/p/empty.sh', '  ')).toEqual([])
    expect(runLines('/p/a.ts', 'x')).toEqual([])
  })
  it('shell commands of Markdown code blocks', () => {
    const md = [
      '# Install', '', '```bash', 'npm install', '# a comment', '', '$ npm run dev', 'docker run \\', '  -p 80:80 \\', '  nginx', '```',
      '', '```console', '$ ls -la', 'total 8', 'drwxr-xr-x  2 me', '```',
      '```ts', 'const x = 1', '```',
      '~~~sh', 'make all', '~~~',
      '```', 'no language', '```',
    ].join('\n')
    expect(runLines('/p/docs/README.md', md).map((l) => [l.line, l.command, l.cwd])).toEqual([
      [4, 'npm install', '/p/docs'], [7, 'npm run dev', '/p/docs'], [8, 'docker run -p 80:80 nginx', '/p/docs'], [14, 'ls -la', '/p/docs'], [22, 'make all', '/p/docs'],
    ])
    expect(runLines('/p/README.md', '```bash\nnpm install\n```')[0].itemId).toBe('md:/p/README.md:2')
    expect(runLines('/p/README.md', '```bash\n' + 'x'.repeat(60) + '\n```')[0].label).toHaveLength(40)
  })
})
