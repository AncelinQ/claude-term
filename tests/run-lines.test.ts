import { describe, it, expect } from 'vitest'
import { packageScriptLines } from '../src/shared/run-lines'

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
  it('works on a file being edited and without scripts', () => {
    expect(packageScriptLines('{ "scripts": { "a": "x", "b": ')).toEqual([{ name: 'a', line: 1 }, { name: 'b', line: 1 }])
    expect(packageScriptLines('{ "name": "x" }')).toEqual([])
    expect(packageScriptLines('')).toEqual([])
    expect(packageScriptLines('{ "scripts": {} }')).toEqual([])
  })
})
