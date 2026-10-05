import { create } from 'zustand'

/**
 * A line the app asks the user for (a saved prompt's {saisie}); the App shows it in the prompt modal. `emptyLabel`:
 * the answer may be empty, and the OK button says what that does.
 */
export const useAsk = create<{
  req: { title: string; placeholder?: string; emptyLabel?: string } | null
  resolve: ((v: string | null) => void) | null
  ask(title: string, placeholder?: string, o?: { emptyLabel?: string }): Promise<string | null>
  done(v: string | null): void
}>((set, get) => ({
  req: null, resolve: null,
  ask: (title, placeholder, o) => new Promise((resolve) => { get().resolve?.(null); set({ req: { title, placeholder, emptyLabel: o?.emptyLabel }, resolve }) }),
  done: (v) => { get().resolve?.(v); set({ req: null, resolve: null }) },
}))
