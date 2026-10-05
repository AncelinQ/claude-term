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
