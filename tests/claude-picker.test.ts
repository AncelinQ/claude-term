import { describe, it, expect } from 'vitest'
import { effortSlider, highlightedModel, inputDraft, isChoice, isModelPicker, isSwitchConfirm, type ScreenRow } from '../src/shared/claude-picker'

// screens of Claude Code v2.1.289, taken in a real session

/** the confirmation that follows `s` in a conversation already started */
const SWITCH_CONFIRM = [
  '─────────────────────────────────────────────────────────────────',
  '  Switch model?',
  '  Your next response will be slower and use more tokens',
  '  This conversation is cached for the current model. Switching',
  '  to Opus 5.5 means the full history gets re-read on your next',
  '  message.',
  '  ❯ 1. Yes, switch to Opus 5.5 ',
  '    2. No, go back',
]

const MODEL_PICKER = [
  '─────────────────────────────────────────────────────────────────',
  '  Select model',
  '  Switch between Claude models. Your pick becomes the default ',
  '  for new sessions. For other/previous model names, specify ',
  '  with --model.',
  '    1.  Default (recommended)  Opus 5.5 · Best for everyday,     ',
  '                               complex tasks',
  '  ❯ 2.  Opus 5.5 ✔             For complex work and everyday     ',
  '                               tasks',
  '     … +10 models',
  '  ◉ xHigh effort ←/→ to adjust',
  '  Enter to set as default · s to use this session only · Esc to  ',
  '  cancel',
]

/** the effort slider, on medium */
const EFFORT_SLIDER = [
  '❯ /effort                                                        ',
  '─────────────────────────────────────────────────────────────────',
  '  Effort',
  '            Faster                             Smarter',
  '            ──────────▲───────────────────────────────',
  '            low     medium     high     xhigh      max',
  '                          Ultracode  off',
  '  ←/→ to adjust · Enter to confirm · s for this session only ·',
  '  Esc to cancel',
]

describe("Claude Code's pickers on screen", () => {
  it("knows the model list and reads its highlighted line without the check mark", () => {
    expect(isModelPicker(MODEL_PICKER)).toBe(true)
    expect(highlightedModel(MODEL_PICKER)).toBe('Opus 5.5')
    expect(highlightedModel(['  ❯ 4.  Sonnet 5.5             Most efficient for simpler tasks'])).toBe('Sonnet 5.5')
    expect(highlightedModel(['  ❯ 12. Sonnet 4.6'])).toBe('Sonnet 4.6')
    expect(isModelPicker(EFFORT_SLIDER)).toBe(false)
    expect(highlightedModel(['❯ /model', '❯ Try "how does <filepath> work?"'])).toBeUndefined()
  })

  it('knows the confirmation of a switch in a conversation already started', () => {
    expect(isSwitchConfirm(SWITCH_CONFIRM)).toBe(true)
    expect(isModelPicker(SWITCH_CONFIRM)).toBe(false)
    expect(isSwitchConfirm(MODEL_PICKER)).toBe(false)
  })

  it("matches a line with the bubble's choice: family, 1M window or not", () => {
    expect(isChoice('Opus 5.5', 'opus')).toBe(true)
    expect(isChoice('Opus 5.5 (1M context)', 'opus')).toBe(false)
    expect(isChoice('Opus 5.5 (1M context)', 'opus[1m]')).toBe(true)
    expect(isChoice('Opus 5.5', 'opus[1m]')).toBe(false)
    expect(isChoice('Default (recommended)', 'opus')).toBe(false)
    expect(isChoice('Haiku 4.5', 'haiku')).toBe(true)
    expect(isChoice('Fable 5.1', 'sonnet')).toBe(false)
  })

  it('reads the effort levels and the one under the marker', () => {
    expect(effortSlider(EFFORT_SLIDER)).toEqual({ levels: ['low', 'medium', 'high', 'xhigh', 'max'], current: 1 })
    const high = EFFORT_SLIDER.map((l) => (l.includes('▲') ? '            ────────────────────▲─────────────────────' : l))
    expect(effortSlider(high)?.current).toBe(2)
    const between = EFFORT_SLIDER.map((l) => (l.includes('▲') ? '            ───────────────────────────▲───────────' : l))
    expect(effortSlider(between)?.current).toBe(3)
    expect(effortSlider(MODEL_PICKER)).toBeUndefined()
    expect(effortSlider(['s for this session only'])).toBeUndefined()
    expect(effortSlider(['s for this session only', '▲', 'one'])).toBeUndefined()
    expect(effortSlider(['s for this session only', '▲'])).toBeUndefined()
  })
})

describe('the input line', () => {
  const row = (text: string, dimFrom = Infinity): ScreenRow => ({ text, dim: [...text].map((_, at) => at >= dimFrom) })
  const rule = row('─────────────────────────')

  it('reads what was typed under the rule, not a dimmed suggestion', () => {
    expect(inputDraft([row('❯ /model'), row(''), rule, row('❯ corrige le test'), rule])).toBe('corrige le test')
    expect(inputDraft([rule, row('❯ Try "how does <filepath> work?"', 2), rule])).toBe('')
    expect(inputDraft([rule, row('❯ '), rule])).toBe('')
    expect(inputDraft([rule, row('❯ /mo del', 5), rule])).toBe('/mo')
  })

  it('finds none under a picker or a permission request', () => {
    expect(inputDraft(MODEL_PICKER.map((t) => row(t)))).toBeUndefined()
    expect(inputDraft([row('Do you want to proceed?'), row('❯ 1. Yes'), row('  2. No')])).toBeUndefined()
    expect(inputDraft([rule, row('  text ❯ not first'), rule])).toBeUndefined()
  })
})
