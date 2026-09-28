import { create } from 'zustand'
import type { UsageState } from '@shared/ipc'

/**
 * What Claude Code's status line said about each session (model, context %): it only keeps the last session that
 * refreshed, so the values are gathered here by session id as the sessions take turns. Plus the model a tab asked
 * for with the bubble, shown until its transcript confirms a new one.
 */
interface UsageStore {
  bySession: Record<string, { model?: string; contextPercent?: number; at: number }>
  requested: Record<string, { alias: string; from?: string }>
  /** ~/.claude/settings.json model (what a new session starts with) */
  defaultModel?: string
  request(tabId: string, alias: string, currentModel?: string): void
  init(): void
}

export const useUsage = create<UsageStore>((set) => ({
  bySession: {},
  requested: {},
  request(tabId, alias, currentModel) { set((s) => ({ requested: { ...s.requested, [tabId]: { alias, from: currentModel } } })) },
  init() {
    const take = (u: UsageState) => {
      const ss = u.snapshot?.session
      if (!ss?.id || !u.snapshot) return
      set((s) => ({ bySession: { ...s.bySession, [ss.id!]: { model: ss.model, contextPercent: ss.contextPercent, at: u.snapshot!.at } } }))
    }
    window.ct.usage.state().then(take)
    window.ct.usage.claude().then((i) => set({ defaultModel: i.model ?? undefined }))
    window.ct.usage.onChanged(take)
  },
}))
