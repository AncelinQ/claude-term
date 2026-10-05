import { create } from 'zustand'

/** A line the app asks the user for (a saved prompt's {saisie}); the App shows it in the prompt modal. */
export const useAsk = create<{
  req: { title: string; placeholder?: string } | null
  resolve: ((v: string | null) => void) | null
  ask(title: string, placeholder?: string): Promise<string | null>
  done(v: string | null): void
}>((set, get) => ({
  req: null, resolve: null,
  ask: (title, placeholder) => new Promise((resolve) => { get().resolve?.(null); set({ req: { title, placeholder }, resolve }) }),
  done: (v) => { get().resolve?.(v); set({ req: null, resolve: null }) },
}))
