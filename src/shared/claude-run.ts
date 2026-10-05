/**
 * An isolated `claude -p` (pure, tested): no tool, no MCP server, no settings (so no hook, ours included), no session
 * kept (History stays clean), the instructions as the system prompt, a spending cap. What the app asks it: a session's
 * diagram, a commit message, a merge request, a skill. Run only on a click; the cost is shown.
 */

/** Spending cap of one run, in dollars: a draft must cost nothing more. */
export const RUN_BUDGET_USD = 1
/** Good enough to read a diff, without Opus's price. */
export const RUN_MODEL = 'sonnet'

export function printArgs(instructions: string, model = RUN_MODEL): string[] {
  return [
    '-p', '--output-format', 'json', '--no-session-persistence',
    '--tools', '', '--strict-mcp-config', '--setting-sources', '',
    '--model', model, '--max-budget-usd', String(RUN_BUDGET_USD),
    '--system-prompt', instructions,
  ]
}

export interface RunResult { text: string; costUsd?: number; model?: string }

/** `claude -p --output-format json`'s answer, or why it gave nothing. */
export function parsePrintOutput(stdout: string): RunResult {
  let o: Record<string, unknown>
  try { o = JSON.parse(stdout) } catch { throw new Error(stdout.trim() || 'réponse illisible de claude -p') }
  const text = typeof o.result === 'string' ? o.result : ''
  if (o.is_error === true || o.subtype !== 'success') throw new Error(text || `claude -p a échoué (${String(o.subtype ?? 'inconnu')})`)
  const usage = o.modelUsage
  const model = usage && typeof usage === 'object' ? Object.keys(usage)[0] : undefined
  return { text, ...(typeof o.total_cost_usd === 'number' ? { costUsd: o.total_cost_usd } : {}), ...(model ? { model } : {}) }
}

/** A code block wrapping the whole answer despite the instructions, taken off. */
export function unfence(answer: string): string {
  const t = answer.trim()
  return (/^```[a-z]*\n([\s\S]*?)\n```$/.exec(t)?.[1] ?? t).trim()
}

const DIAGRAM_START = /^(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|mindmap)\b/

/** The Mermaid source of an answer: its ```mermaid block, or the whole answer when it is one. */
export function extractMermaid(answer: string): string | undefined {
  const fenced = /```mermaid[^\n]*\n([\s\S]*?)```/.exec(answer)?.[1]?.trim()
  if (fenced) return fenced
  const bare = answer.trim()
  return DIAGRAM_START.test(bare) ? bare : undefined
}

// MARK: what claude -p reads

/** Size of what is sent, in characters: some 15k tokens at most. A long session touches hundreds of files. */
export const DIGEST_MAX = 60_000
/** Share of the digest left to the requests, the rest to the diffs. */
const PROMPTS_SHARE = 0.2
/** A request is cut beyond: its intent matters, not its detail. */
const PROMPT_MAX = 600

export interface FileChange { path: string; unified: string; created?: boolean; deleted?: boolean }
export interface Digest { text: string; truncated: boolean }

const cut = (text: string, max: number) => (text.length <= max ? { text, cut: false } : { text: `${text.slice(0, max)}\n[… coupé]`, cut: true })
const counts = (unified: string) => {
  let add = 0, del = 0
  for (const l of unified.split('\n')) { if (l.startsWith('+') && !l.startsWith('+++')) add++; else if (l.startsWith('-') && !l.startsWith('---')) del++ }
  return { add, del }
}

/**
 * A session for claude -p: its title, its requests, the files it changed, then their diffs, each cut to its share of
 * the budget so that one big file does not crowd out the others.
 */
export function sessionDigest(input: { title?: string; prompts: string[]; changes: FileChange[] }, max = DIGEST_MAX): Digest {
  let truncated = false
  const parts: string[] = []
  if (input.title) parts.push(`# Session\n${input.title}`)
  const prompts: string[] = []
  let used = 0
  for (const [i, p] of input.prompts.entries()) {
    const c = cut(p.replace(/\s+/g, ' ').trim(), PROMPT_MAX)
    const line = `${i + 1}. ${c.text}`
    if (used + line.length > Math.floor(max * PROMPTS_SHARE)) { truncated = true; break }
    if (c.cut) truncated = true
    prompts.push(line); used += line.length
  }
  if (prompts.length) parts.push(`# Demandes\n${prompts.join('\n')}`)
  const changed = input.changes.filter((c) => c.unified || c.created || c.deleted)
  if (changed.length) parts.push(`# Fichiers changés\n${changed.map((c) => { const n = counts(c.unified); return `- ${c.path}${c.created ? ' (créé)' : c.deleted ? ' (supprimé)' : ''} +${n.add} -${n.del}` }).join('\n')}`)
  const readable = changed.filter((c) => c.unified)
  let remaining = max - parts.join('\n\n').length
  const diffs: string[] = []
  for (const [i, c] of readable.entries()) {
    const share = Math.floor(remaining / (readable.length - i))
    if (share < 200) { truncated = true; break }
    const piece = cut(c.unified, share)
    if (piece.cut) truncated = true
    diffs.push(piece.text); remaining -= piece.text.length
  }
  if (diffs.length) parts.push(`# Diffs\n${diffs.join('\n')}`)
  return { text: parts.join('\n\n'), truncated }
}

// MARK: instructions

export type Lang = 'fr' | 'en'

export function diagramInstructions(lang: Lang): string {
  return (lang === 'en' ? [
    'You receive a Claude Code session: the user\'s requests, the files it changed and their diffs.',
    'Draw one Mermaid diagram showing what the session changed and how the changes connect (data flow, calls, dependencies).',
    'Each node names a change, not a file. Several files serving the same change make one node.',
    'Use a flowchart (LR or TD), 25 nodes at most, labels of a few English words, no paths; group by feature or package with subgraphs.',
    'Answer with the ```mermaid block only, nothing before or after.',
  ] : [
    'Tu reçois une session de Claude Code : les demandes de l\'utilisateur, les fichiers changés et leurs diffs.',
    'Dessine un seul diagramme Mermaid qui montre ce que la session a changé et comment ces changements s\'articulent (flux de données, appels, dépendances).',
    'Chaque nœud nomme un changement, pas un fichier. Plusieurs fichiers au service du même changement font un seul nœud.',
    'Un flowchart (LR ou TD), 25 nœuds au plus, des libellés de quelques mots en français, sans chemins ; regroupe par fonctionnalité ou par paquet avec des subgraph.',
    'Réponds uniquement par le bloc ```mermaid, rien avant ni après.',
  ]).join('\n')
}

/** The repository's last subjects give its convention and language; without history, Conventional Commits in English. */
export function commitInstructions(recentSubjects: string[]): string {
  return [
    'You receive changes to commit: their diff, and the files they touch.',
    'Write the git commit message for these changes.',
    recentSubjects.length
      ? `Recent commit subjects of this repository, newest first: follow their convention (type, scope, tense, language) exactly:\n${recentSubjects.map((s) => `- ${s}`).join('\n')}`
      : 'The repository has no history yet: use Conventional Commits, in English.',
    'Subject line of 72 characters at most. Then a blank line and a body wrapped at 72 columns that says what changed and why, in a few short paragraphs or bullets, not a file-by-file list.',
    'No mention of Claude, no trailers.',
    'Answer with the commit message only, nothing before or after, no code fence.',
  ].join('\n\n')
}

export function mrInstructions(lang: Lang): string {
  return (lang === 'en' ? [
    'You receive a branch to merge: its commits and its diff against the target branch.',
    'Write the merge request in English Markdown: a first line `# <title>` of 72 characters at most, then the sections `## Why`, `## What changes` (grouped by feature, not by file) and `## How to test` (concrete steps).',
    'Stay factual and short; no mention of Claude.',
    'Answer with the Markdown only, nothing before or after, no code fence around it.',
  ] : [
    'Tu reçois une branche à fusionner : ses commits et son diff avec la branche cible.',
    'Rédige la merge request en Markdown et en français : une première ligne `# <titre>` de 72 caractères au plus, puis les sections `## Pourquoi`, `## Ce qui change` (regroupé par fonctionnalité, pas par fichier) et `## Comment tester` (des étapes concrètes).',
    'Reste factuel et bref ; ne parle pas de Claude.',
    'Réponds uniquement par le Markdown, rien avant ni après, sans bloc de code autour.',
  ]).join('\n\n')
}

/** A Claude Code skill: its front matter (name, description saying when to use it) and its instructions. */
export function skillInstructions(lang: Lang): string {
  return (lang === 'en' ? [
    'You write a Claude Code skill: a SKILL.md file that Claude Code loads when its description matches the task.',
    'You receive the skill\'s name and what it is for.',
    'Start with a YAML front matter between --- lines: `name` (the given name) and `description` (one sentence saying when Claude must use it, starting with "Use when").',
    'Then the instructions in Markdown: when to use it, the steps, the constraints, an example if useful. Short and concrete.',
    'Answer with the file content only, no code fence around it.',
  ] : [
    'Tu écris un skill de Claude Code : un fichier SKILL.md que Claude Code charge quand sa description correspond à la tâche.',
    'Tu reçois le nom du skill et ce à quoi il sert.',
    'Commence par un front matter YAML entre deux lignes --- : `name` (le nom donné) et `description` (une phrase qui dit quand Claude doit l\'utiliser).',
    'Puis les instructions en Markdown, en français : quand l\'utiliser, les étapes, les contraintes, un exemple si utile. Court et concret.',
    'Réponds uniquement par le contenu du fichier, sans bloc de code autour.',
  ]).join('\n\n')
}
