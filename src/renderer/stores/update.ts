import { create } from 'zustand'
import type { UpdateState } from '@shared/update'

export const useUpdate = create<{ state: UpdateState; init(): void }>((set) => ({
  state: { status: 'idle' },
  init() {
    window.ct.update.state().then((state) => set({ state }))
    window.ct.update.onState((state) => set({ state }))
  },
}))
