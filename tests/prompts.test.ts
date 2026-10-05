import { describe, it, expect } from 'vitest'
import { expandPrompt, frequentCommands, promptKeys, promptVariables, type SavedPrompt } from '../src/shared/prompts'

describe('saved prompts', () => {
  it('finds and fills the variables, French or English names', () => {
    expect(promptVariables('Relis {fichier} sur {branche}, puis {file}')).toEqual(['file', 'branch'])
    expect(expandPrompt('Explique {sélection} dans {fichier}', { selection: 'x = 1', file: 'src/a.ts' })).toEqual({ text: 'Explique x = 1 dans src/a.ts' })
    expect(expandPrompt('Ticket {saisie} sur {branch}', { branch: 'main' })).toEqual({ missing: ['input'] })
    expect(expandPrompt('sans variable', {})).toEqual({ text: 'sans variable' })
    expect(expandPrompt('{inconnue} reste', {})).toEqual({ text: '{inconnue} reste' })
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
