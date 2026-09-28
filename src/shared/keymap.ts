/** Keymap: actions with JetBrains-style defaults. Shortcuts are "Mod+Shift+L" (Mod = ⌘ on macOS, Ctrl elsewhere). */
export interface KeyAction { id: string; scope: 'general' | 'editor'; label: string; default: string }

export const ACTIONS: KeyAction[] = [
  // general
  { id: 'app.newShell', scope: 'general', label: 'Nouvel onglet shell', default: 'Mod+T' },
  { id: 'app.newClaude', scope: 'general', label: 'Nouvel onglet Claude', default: 'Mod+Shift+T' },
  { id: 'app.closeTab', scope: 'general', label: "Fermer l'onglet", default: 'Mod+W' },
  { id: 'app.nextTab', scope: 'general', label: 'Onglet suivant', default: 'Mod+Shift+]' },
  { id: 'app.prevTab', scope: 'general', label: 'Onglet précédent', default: 'Mod+Shift+[' },
  { id: 'app.newProject', scope: 'general', label: 'Nouveau projet', default: 'Mod+N' },
  { id: 'app.openFolder', scope: 'general', label: 'Ouvrir un dossier', default: 'Mod+O' },
  { id: 'app.goToFile', scope: 'general', label: 'Aller au fichier', default: 'Mod+Shift+O' },
  { id: 'app.settings', scope: 'general', label: 'Réglages', default: 'Mod+,' },
  { id: 'app.save', scope: 'general', label: 'Enregistrer', default: 'Mod+S' },
  { id: 'app.screenshot', scope: 'general', label: "Capture d'écran → prompt", default: 'Mod+Alt+S' },
  { id: 'app.explorer', scope: 'general', label: 'Explorateur', default: 'Mod+1' },
  { id: 'app.run', scope: 'general', label: 'Exécuteurs', default: 'Mod+7' },
  { id: 'app.git', scope: 'general', label: 'Git', default: 'Mod+9' },
  { id: 'app.commit', scope: 'general', label: 'Commit', default: 'Mod+K' },
  // editor (Monaco commands)
  { id: 'editor.action.formatDocument', scope: 'editor', label: 'Reformater le code', default: 'Mod+Alt+L' },
  { id: 'editor.action.commentLine', scope: 'editor', label: 'Commenter la ligne', default: 'Mod+/' },
  { id: 'editor.action.blockComment', scope: 'editor', label: 'Commentaire de bloc', default: 'Mod+Alt+/' },
  { id: 'editor.action.copyLinesDownAction', scope: 'editor', label: 'Dupliquer la ligne', default: 'Mod+D' },
  { id: 'editor.action.deleteLines', scope: 'editor', label: 'Supprimer la ligne', default: 'Mod+Backspace' },
  { id: 'editor.action.moveLinesUpAction', scope: 'editor', label: 'Monter la ligne', default: 'Alt+Shift+ArrowUp' },
  { id: 'editor.action.moveLinesDownAction', scope: 'editor', label: 'Descendre la ligne', default: 'Alt+Shift+ArrowDown' },
  { id: 'editor.action.gotoLine', scope: 'editor', label: 'Aller à la ligne', default: 'Mod+L' },
  { id: 'actions.find', scope: 'editor', label: 'Rechercher', default: 'Mod+F' },
  { id: 'editor.action.startFindReplaceAction', scope: 'editor', label: 'Remplacer', default: 'Mod+R' },
  { id: 'editor.action.addSelectionToNextFindMatch', scope: 'editor', label: 'Sélectionner l’occurrence suivante', default: 'Ctrl+G' },
  { id: 'editor.action.smartSelect.expand', scope: 'editor', label: 'Étendre la sélection', default: 'Alt+ArrowUp' },
  { id: 'editor.action.smartSelect.shrink', scope: 'editor', label: 'Réduire la sélection', default: 'Alt+ArrowDown' },
  { id: 'editor.action.revealDefinition', scope: 'editor', label: 'Aller à la définition', default: 'Mod+B' },
  { id: 'editor.action.rename', scope: 'editor', label: 'Renommer le symbole', default: 'Shift+F6' },
  { id: 'editor.action.triggerSuggest', scope: 'editor', label: 'Complétion', default: 'Ctrl+Space' },
  { id: 'editor.foldAll', scope: 'editor', label: 'Tout replier', default: 'Mod+Shift+-' },
  { id: 'editor.unfoldAll', scope: 'editor', label: 'Tout déplier', default: 'Mod+Shift+=' },
]

export interface Combo { mod: boolean; ctrl: boolean; alt: boolean; shift: boolean; key: string }

/** "Mod+Shift+L" → combo. Key names follow KeyboardEvent.key (single chars lowercased). */
export function parse(s: string): Combo | null {
  if (!s) return null
  const parts = s.split('+'); const key = parts.pop()!
  if (!key) return null
  const c: Combo = { mod: false, ctrl: false, alt: false, shift: false, key: key.length === 1 ? key.toLowerCase() : key }
  for (const p of parts) {
    if (p === 'Mod') c.mod = true; else if (p === 'Ctrl') c.ctrl = true; else if (p === 'Alt') c.alt = true; else if (p === 'Shift') c.shift = true; else return null
  }
  return c
}

/** Event (key, code and modifier flags) → does it match `s` on this platform? */
export function matches(s: string, e: { key: string; code?: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }, mac: boolean): boolean {
  const c = parse(s)
  if (!c) return false
  const wantMeta = mac && c.mod, wantCtrl = (!mac && c.mod) || c.ctrl
  if (e.metaKey !== wantMeta || e.ctrlKey !== wantCtrl || e.altKey !== c.alt || e.shiftKey !== c.shift) return false
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
  // with Alt/Shift on macOS, e.key is the composed character: fall back to the physical key
  const fromCode = e.code?.startsWith('Key') ? e.code.slice(3).toLowerCase() : e.code?.startsWith('Digit') ? e.code.slice(5) : undefined
  const codeKey: Record<string, string> = { Slash: '/', Comma: ',', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Space: 'Space' }
  return k === c.key || fromCode === c.key || (e.code !== undefined && codeKey[e.code] === c.key) || (c.key === 'Space' && k === ' ')
}

/** Combo from a keydown (the recorder in the settings); null while only modifiers are held. */
export function fromEvent(e: { key: string; code?: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }, mac: boolean): string | null {
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return null
  const parts: string[] = []
  if (mac ? e.metaKey : e.ctrlKey) parts.push('Mod')
  if (mac && e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  const code = e.code ?? ''
  const key = code.startsWith('Key') ? code.slice(3).toUpperCase() : code.startsWith('Digit') ? code.slice(5)
    : ({ Slash: '/', Comma: ',', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Space: 'Space' } as Record<string, string>)[code] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key)
  parts.push(key)
  return parts.join('+')
}

/** Human label: ⌘⇧L on macOS, Ctrl+Shift+L elsewhere. */
export function label(s: string, mac: boolean): string {
  const c = parse(s)
  if (!c) return '—'
  const arrows: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backspace: mac ? '⌫' : 'Backspace', Space: mac ? '␣' : 'Space' }
  const k = arrows[c.key] ?? c.key.toUpperCase()
  if (mac) return (c.ctrl ? '⌃' : '') + (c.alt ? '⌥' : '') + (c.shift ? '⇧' : '') + (c.mod ? '⌘' : '') + k
  return [c.mod || c.ctrl ? 'Ctrl' : '', c.alt ? 'Alt' : '', c.shift ? 'Shift' : '', k].filter(Boolean).join('+')
}

export function binding(id: string, overrides: Record<string, string>): string {
  return overrides[id] ?? ACTIONS.find((a) => a.id === id)?.default ?? ''
}

/** Actions sharing a shortcut within the same scope (general conflicts with everything). */
export function conflicts(overrides: Record<string, string>): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const a of ACTIONS) for (const b of ACTIONS) {
    if (a.id === b.id) continue
    const x = binding(a.id, overrides), y = binding(b.id, overrides)
    if (x && x === y && (a.scope === b.scope || a.scope === 'general' || b.scope === 'general')) (out[a.id] ??= []).push(b.id)
  }
  return out
}
