import { describe, it, expect } from 'vitest'
import { expandPrompt, frequentCommands, numberPrompts, PROMPT_KEYS, promptKeys, promptVariables, type SavedPrompt } from '../src/shared/prompts'
import { sameKey } from '../src/shared/keymap'

describe('saved prompts', () => {
  it('finds and fills the variables, French or English names', () => {
    expect(promptVariables('Relis {fichier} sur {branche}, puis {file}')).toEqual(['file', 'branch'])
    expect(expandPrompt('Explique {sélection} dans {fichier}', { selection: 'x = 1', file: 'src/a.ts' })).toEqual({ text: 'Explique x = 1 dans src/a.ts' })
    expect(expandPrompt('Ticket {saisie} sur {branch}', { branch: 'main' })).toEqual({ missing: ['input'] })
    expect(expandPrompt('sans variable', {})).toEqual({ text: 'sans variable' })
    expect(expandPrompt('{inconnue} reste', {})).toEqual({ text: '{inconnue} reste' })
  })

  it('numbers the prompts that never had a key: Ctrl+Shift+2 to 9, skipping what is held, then none', () => {
    const same = (a: string, b: string) => sameKey(a, b, false)
    const p = (id: string, shortcut?: string): SavedPrompt => ({ id, name: id, text: id, mode: 'send', ...(shortcut !== undefined ? { shortcut } : {}) })
    expect(PROMPT_KEYS).toEqual(['Ctrl+Shift+2', 'Ctrl+Shift+3', 'Ctrl+Shift+4', 'Ctrl+Shift+5', 'Ctrl+Shift+6', 'Ctrl+Shift+7', 'Ctrl+Shift+8', 'Ctrl+Shift+9'])
    expect(numberPrompts([p('a', 'Ctrl+Shift+2'), p('b', '')], [], same)).toBeNull()
    // a prompt holds 3, the app holds 2 (written Mod+Shift+2), one removed its key on purpose
    const out = numberPrompts([p('a'), p('b', 'Ctrl+Shift+3'), p('c', ''), p('d')], ['Mod+Shift+2', 'Mod+8'], same)!
    expect(out.map((x) => x.shortcut)).toEqual(['Ctrl+Shift+4', 'Ctrl+Shift+3', '', 'Ctrl+Shift+5'])
    // all eight held: the next one gets none, and is not numbered again
    const full = numberPrompts([...PROMPT_KEYS.map((k, i) => p('k' + i, k)), p('late')], [], same)!
    expect(full.at(-1)!.shortcut).toBe('')
    expect(numberPrompts(full, [], same)).toBeNull()
  })

  it('sends without {saisie} left empty, and the blank before it; other variables still block', () => {
    expect(expandPrompt('/sc:brainstorm {saisie}', { input: '' })).toEqual({ text: '/sc:brainstorm' })
    expect(expandPrompt('Ticket {saisie} sur {branche}', { input: '', branch: 'main' })).toEqual({ text: 'Ticket sur main' })
    expect(expandPrompt('{input}: go', { input: '' })).toEqual({ text: ': go' })
    expect(expandPrompt('Revue de {saisie}', { input: 'HN-12' })).toEqual({ text: 'Revue de HN-12' })
    expect(expandPrompt('Explique {sélection}', { selection: '' })).toEqual({ missing: ['selection'] })
    expect(expandPrompt('Revue de {saisie}', {})).toEqual({ missing: ['input'] })
  })

  it('types a bracketed paste, Enter apart when it sends', () => {
    expect(promptKeys('a\nb', 'send')).toEqual({ paste: '\x1b[200~a\nb\x1b[201~', enter: true })
    expect(promptKeys('x\x1b[201~y', 'insert')).toEqual({ paste: '\x1b[200~xy\x1b[201~', enter: false })
  })

  it('suggests the slash commands typed often, not built-in nor saved', () => {
    const saved: SavedPrompt[] = [{ id: '1', name: 'Revue', text: '/sc:review le code', mode: 'send' }]
    expect(frequentCommands({ '/sc:analyze': 5, '/sc:review': 9, '/clear': 40, '/rare': 2, '/git': 3 }, saved))
      .toEqual([{ command: '/sc:analyze', count: 5 }, { command: '/git', count: 3 }])
  })
})
