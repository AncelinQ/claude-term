import { create } from 'zustand'
import type { PluginInfo, ViewModel } from '@shared/plugins'

interface PluginStore {
  plugins: PluginInfo[]
  views: Record<string, ViewModel>
  init(): void
  /** activity entries contributed for a side */
  activities(side: 'left' | 'right'): { id: string; title: string; icon: string; pluginId: string }[]
  viewsOf(activityId: string): { id: string; title: string; pluginId: string }[]
}

export const usePlugins = create<PluginStore>((set, get) => ({
  plugins: [],
  views: {},
  init() {
    window.ct.plugins.list().then((plugins) => set({ plugins }))
    window.ct.plugins.onChanged((plugins) => set({ plugins }))
    window.ct.plugins.onView(({ viewId, model }) => set((s) => ({ views: { ...s.views, [viewId]: model } })))
  },
  activities(side) {
    return get().plugins.filter((p) => p.enabled).flatMap((p) => (p.manifest.contributes?.activity ?? []).filter((a) => a.side === side).map((a) => ({ id: `${p.manifest.id}:${a.id}`, title: a.title, icon: a.icon, pluginId: p.manifest.id })))
  },
  viewsOf(activityId) {
    const [pluginId, aid] = activityId.split(':')
    const p = get().plugins.find((x) => x.manifest.id === pluginId)
    return (p?.manifest.contributes?.views ?? []).filter((v) => v.activity === aid).map((v) => ({ id: `${pluginId}:${v.id}`, title: v.title, pluginId }))
  },
}))
