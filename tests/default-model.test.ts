import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { TempDir } from './helpers'
import { ClaudeSettings } from '../src/main/services/claude-settings'
import { setDefaultModel } from '../src/main/services/default-model'

describe('default model', () => {
  it('writes the default of new sessions, keeps the other keys, removes it with null', () => {
    const t = new TempDir()
    const file = t.write('settings.json', JSON.stringify({ model: 'opus', other: 1 }))
    const s = new ClaudeSettings(file)
    expect(setDefaultModel(s, 'sonnet[1m]')).toEqual({ ok: true })
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ model: 'sonnet[1m]', other: 1 })
    expect(setDefaultModel(s, null)).toEqual({ ok: true })
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ other: 1 })
    t.write('settings.json', '{ broken')
    expect(setDefaultModel(s, 'opus')).toMatchObject({ ok: false })
    t.dispose()
  })
})
