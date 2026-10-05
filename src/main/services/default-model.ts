import type { ClaudeSettings } from './claude-settings'

/**
 * The Claude panel's default model for new sessions, in ~/.claude/settings.json (none: the key removed). A tab's own
 * model goes through Claude Code's picker for its session only (renderer/claude-picker): it never touches this file.
 */
export function setDefaultModel(settings: ClaudeSettings, model: string | null): { ok: boolean; error?: string } {
  const r = settings.read()
  if (!r.ok) return { ok: false, error: r.error }
  if (model) r.data.model = model; else delete r.data.model
  try { settings.write(r.data) } catch (e) { return { ok: false, error: String(e) } }
  return { ok: true }
}
