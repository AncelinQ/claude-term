import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { TempDir } from './helpers'
import { ClaudeSettings } from '../src/main/services/claude-settings'
import { DefaultModelGuard } from '../src/main/services/default-model'

function setup(initial: object) {
  const t = new TempDir()
  const file = t.write('settings.json', JSON.stringify(initial))
  let now = 0
  const g = new DefaultModelGuard(new ClaudeSettings(file), () => now, 60_000, false)
  const read = () => JSON.parse(readFileSync(file, 'utf8'))
  const claudeWrites = (model: string) => t.write('settings.json', JSON.stringify({ ...read(), model }))
  return { t, g, read, claudeWrites, tick: (ms: number) => { now += ms } }
}

describe('default model guard', () => {
  it('puts the default back when Claude Code saves the switched alias, even late', () => {
    const { t, g, read, claudeWrites, tick } = setup({ model: 'opus[1m]', other: 1 })
    g.beforeSwitch('haiku')
    expect(g.check()).toBe(false)          // not written yet
    tick(20_000)                            // Claude was busy: the command ran 20 s later
    claudeWrites('haiku')
    expect(g.check()).toBe(true)
    expect(read()).toEqual({ model: 'opus[1m]', other: 1 })
    t.dispose()
  })
  it('two quick switches keep the first default, not the first alias', () => {
    const { t, g, read, claudeWrites } = setup({ model: 'opus[1m]' })
    g.beforeSwitch('haiku')
    claudeWrites('haiku')
    g.beforeSwitch('sonnet')                // before the first was restored
    expect(g.check()).toBe(true)
    claudeWrites('sonnet')
    expect(g.check()).toBe(true)
    expect(read().model).toBe('opus[1m]')
    t.dispose()
  })
  it('no default: the key is removed again', () => {
    const { t, g, read, claudeWrites } = setup({})
    g.beforeSwitch('fable')
    claudeWrites('fable')
    expect(g.check()).toBe(true)
    expect(read()).toEqual({})
    t.dispose()
  })
  it('a change made elsewhere (the panel, another editor) becomes the default to keep', () => {
    const { t, g, read, claudeWrites } = setup({ model: 'opus' })
    g.beforeSwitch('haiku')
    expect(g.setDefault('sonnet')).toEqual({ ok: true })
    claudeWrites('haiku')
    expect(g.check()).toBe(true)
    expect(read().model).toBe('sonnet')
    g.beforeSwitch('fable')
    claudeWrites('opus[1m]')                // not an alias we asked for: the user changed it
    expect(g.check()).toBe(false)
    claudeWrites('fable')
    expect(g.check()).toBe(true)
    expect(read().model).toBe('opus[1m]')
    expect(g.setDefault(null)).toEqual({ ok: true })
    expect(read().model).toBeUndefined()
    t.dispose()
  })
  it('stops watching after a while', () => {
    const { t, g, read, claudeWrites, tick } = setup({ model: 'opus' })
    g.beforeSwitch('haiku')
    tick(61_000)
    claudeWrites('haiku')
    expect(g.check()).toBe(false)
    expect(read().model).toBe('haiku')
    t.dispose()
  })
})
