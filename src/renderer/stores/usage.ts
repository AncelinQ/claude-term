import { create } from 'zustand'
import type { UsageState } from '@shared/ipc'

/**
 * What Claude Code's status line said about each session (model, context %): it only keeps the last session that
 * refreshed, so the values are gathered here by session id as the sessions take turns. Plus the model a tab asked
 * for with the bubble, shown until its transcript confirms a new one.
 */
interface UsageStore {
  bySession: Record<string, { model?: string; contextPercent?: number; at: number }>
  requested: Record<string, { alias: string; from?: string; sessionId?: string }>
  /** ~/.claude/settings.json model (what a new session starts with) */
  defaultModel?: string
  request(tabId: string, alias: string, currentModel?: string, sessionId?: string): void
  setDefault(model: string | null): Promise<{ ok: boolean; error?: string }>
  init(): void
}

export const useUsage = create<UsageStore>((set) => ({
  bySession: {},
  requested: {},
  request(tabId, alias, currentModel, sessionId) { set((s) => ({ requested: { ...s.requested, [tabId]: { alias, from: currentModel, sessionId } } })) },
  async setDefault(model) { const r = await window.ct.usage.setDefaultModel(model); if (r.ok) set({ defaultModel: model ?? undefined }); return r },
  init() {
    const take = (u: UsageState) => {
      const ss = u.snapshot?.session
      if (!ss?.id || !u.snapshot) return
      set((s) => ({ bySession: { ...s.bySession, [ss.id!]: { model: ss.model, contextPercent: ss.contextPercent, at: u.snapshot!.at } } }))
    }
    window.ct.usage.state().then(take)
    window.ct.usage.defaultModel().then((m) => set({ defaultModel: m ?? undefined }))
    window.ct.usage.onChanged(take)
  },
}))
