import { describe, it, expect } from 'vitest'
import { contextInfo, contextWindow, currentChoice, isInteractiveClaude, modelLabel, modelName, withWindowHint } from '../src/shared/models'

describe('models', () => {
  it('labels API model ids', () => {
    expect(modelLabel('claude-opus-5-5')).toBe('Opus 5.5')
    expect(modelLabel('claude-fable-5-1')).toBe('Fable 5.1')
    expect(modelLabel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(modelLabel('claude-sonnet-5')).toBe('Sonnet 5')
    expect(modelLabel('claude-opus-5-5[1m]')).toBe('Opus 5.5 · 1M')
    expect(modelLabel('Opus 5.5 (1M context)')).toBe('Opus 5.5 (1M context)')
    expect(modelLabel(undefined)).toBe('')
  })
  it('context: Claude Code figure first, else an estimate over the right window', () => {
    expect(contextInfo({ statusPercent: 54, tokens: 1 })).toEqual({ percent: 54, estimated: false })
    expect(contextInfo({ tokens: 50_000, model: 'claude-opus-5-5' })).toEqual({ percent: 25, estimated: true })
    expect(contextInfo({ tokens: 500_000, model: 'claude-opus-5-5' })).toEqual({ percent: 50, estimated: true })
    expect(contextInfo({ tokens: 100_000, model: 'Opus 5.5 (1M context)' })).toEqual({ percent: 10, estimated: true })
    expect(contextInfo({})).toBeNull()
    expect(contextWindow('opus[1m]')).toBe(1_000_000)
    expect(contextWindow('claude-sonnet-5')).toBe(200_000)
  })
  it('names settings aliases and API ids', () => {
    expect(modelName('opus[1m]')).toBe('Opus · 1M')
    expect(modelName('fable')).toBe('Fable')
    expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
    expect(modelName(undefined)).toBe('')
  })
  it('gets the 1M window of a transcript model from the alias asked for or the default', () => {
    expect(withWindowHint('claude-opus-5-5', undefined, 'opus[1m]')).toBe('claude-opus-5-5[1m]')
    expect(withWindowHint('claude-opus-5-5', 'opus', 'opus[1m]')).toBe('claude-opus-5-5')
    expect(withWindowHint('claude-haiku-4-5', 'opus[1m]')).toBe('claude-haiku-4-5')
    expect(withWindowHint('Opus 5.5 (1M context)', 'opus')).toBe('Opus 5.5 (1M context)')
    expect(withWindowHint(undefined, 'opus[1m]')).toBeUndefined()
    expect(contextInfo({ tokens: 180_000, model: withWindowHint('claude-opus-5-5', undefined, 'opus[1m]') })).toEqual({ percent: 18, estimated: true })
    expect(currentChoice(withWindowHint('claude-opus-5-5', 'opus[1m]'))).toBe('opus[1m]')
  })
  it('tells an interactive Claude session from other claude commands', () => {
    for (const l of ['claude', '  claude --resume abc', 'claude -c', 'claude --model haiku "fix it"']) expect(isInteractiveClaude(l)).toBe(true)
    for (const l of ['claude update', 'claude mcp list', 'claude --version', 'claude -p "x"', 'claudeterm', 'npm run claude', 'claude doctor']) expect(isInteractiveClaude(l)).toBe(false)
  })
  it('matches the running model to a choice', () => {
    expect(currentChoice('claude-opus-5-5')).toBe('opus')
    expect(currentChoice('Opus 5.5 (1M context)')).toBe('opus[1m]')
    expect(currentChoice('claude-fable-5-1')).toBe('fable')
    expect(currentChoice('claude-haiku-4-5-20251001')).toBe('haiku')
    expect(currentChoice('Sonnet 5 (1M context)')).toBe('sonnet[1m]')
    expect(currentChoice('gpt')).toBeUndefined()
    expect(currentChoice(undefined)).toBeUndefined()
  })
})
