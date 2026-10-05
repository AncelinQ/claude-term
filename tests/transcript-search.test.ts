import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { accentPattern, matchText, recordText, searchWords } from '../src/shared/transcript-search'
import { TranscriptSearch } from '../src/main/services/transcript-search'
import { TempDir, jsonl } from './helpers'

describe('full-text search over a projects folder (the bundled ripgrep)', () => {
  it('finds sessions holding every word, prompts and answers only, sub-agents left out', async () => {
    const t = new TempDir()
    t.write('p1/a.jsonl', jsonl([{ type: 'user', timestamp: 't1', message: { content: 'Le déploiement échoue en préprod' } }]))
    t.write('p1/b.jsonl', jsonl([{ type: 'assistant', message: { content: [{ type: 'text', text: 'Corrigé : le DEPLOIEMENT passe en preprod.' }] } }]))
    t.write('p2/c.jsonl', jsonl([{ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: 'deploiement preprod (tool output)' }] } }]))
    t.write('p2/d.jsonl', jsonl([{ type: 'user', message: { content: 'déploiement seul' } }]))
    t.write('p1/a/subagents/agent-x.jsonl', jsonl([{ type: 'user', message: { content: 'déploiement préprod (sub-agent)' } }]))
    const r = await new TranscriptSearch(t.path).search('deploiement  Préprod')
    expect(r.map((x) => x.path).sort()).toEqual([join(t.path, 'p1', 'a.jsonl'), join(t.path, 'p1', 'b.jsonl')])
    expect(r.find((x) => x.path.endsWith('a.jsonl'))!.hits).toEqual([{ role: 'user', snippet: 'Le déploiement échoue en préprod', time: 't1' }])
    expect(await new TranscriptSearch(t.path).search('x')).toEqual([])
    t.dispose()
  })
})

describe('full-text search in transcripts', () => {
  it('folds the words and builds an accent-blind pattern', () => {
    expect(searchWords('Été  été de')).toEqual(['ete', 'de'])
    expect(searchWords('a b')).toEqual([])
    expect(accentPattern('ete')).toBe('[eéèêë]t[eéèêë]')
    expect(new RegExp(accentPattern('creer'), 'i').test('Créer')).toBe(true)
    expect(accentPattern('a.b(c)')).toBe('[aàâäáãå]\\.b\\([cç]\\)')
  })

  it('reads prompts and Claude’s text only', () => {
    expect(recordText({ type: 'user', message: { content: 'refacto du parseur' } })).toEqual({ role: 'user', text: 'refacto du parseur' })
    expect(recordText({ type: 'user', message: { content: '<command-name>/clear</command-name>' } })).toBeNull()
    expect(recordText({ type: 'user', isMeta: true, message: { content: 'x' } })).toBeNull()
    expect(recordText({ type: 'assistant', message: { content: [{ type: 'text', text: 'Fait.' }, { type: 'tool_use', name: 'Edit' }] } })).toEqual({ role: 'assistant', text: 'Fait.' })
    expect(recordText({ type: 'assistant', isSidechain: true, message: { content: [{ type: 'text', text: 'x' }] } })).toBeNull()
    expect(recordText({ type: 'queue-operation' })).toBeNull()
  })

  it('keeps a text holding every word, with a snippet around the first', () => {
    const long = 'x '.repeat(100) + 'Le déploiement échoue sur la préprod' + ' y'.repeat(100)
    const s = matchText(long, ['deploiement', 'preprod'])!
    expect(s.startsWith('…') && s.endsWith('…')).toBe(true)
    expect(s).toContain('déploiement échoue')
    expect(matchText('déploiement ok', ['deploiement', 'preprod'])).toBeNull()
  })
})
