import { useEffect, useState } from 'react'
import { useReorder } from './workbench/useReorder'
import { useWorkbench, useActiveProject, isClaude, type Tab } from './stores/workbench'

import { applyTheme } from './theme/apply'
import { Icons } from './workbench/icons'
import { LeftActivityBar, RightActivityBar } from './workbench/ActivityBar'
import { LeftSidebar, RightSidebar } from './workbench/Sidebars'
import { Center } from './workbench/Center'
import { Welcome } from './workbench/Welcome'
import { SettingsPage } from './workbench/SettingsPage'
import { setLanguage } from './i18n'
import { findAction } from '@shared/keymap'
import { keyEvent, runAppAction, withShortcut } from './actions'
import { numberNewPrompts, promptForKey, runPrompt } from './prompts'
import { useAsk } from './stores/ask'
import { useUpdate } from './stores/update'
import { watchTaskbarBadge } from './taskbar'
import { useUsage } from './stores/usage'
import { usePlugins } from './stores/plugins'
import { PluginPopover } from './workbench/PluginView'
import { Palette } from './workbench/Palette'
import { Decorations } from './workbench/Decorations'
import { sendWhenReady, switchEffort, switchModel, usePickerNotice } from './claude-picker'
import { screenRows } from './terminal/TerminalView'
import { t } from '@/i18n'

/** A tab doing something now: Claude on a turn, or a shell running a command. */
const activeNow = (t: Tab) => t.alive && (isClaude(t) ? !!t.working : t.busy)

export function App() {
  const { theme, settings, projects, activeProjectId, init, setActiveProject, newProject, closeProject, newTab, closeTab, showSettings, setShowSettings, moveProject } = useWorkbench()
  const drag = useReorder('project', (from, to, place) => { if (place !== 'in') moveProject(from, to, place) })
  const project = useActiveProject()
  const [prompt, setPrompt] = useState<import('@shared/plugins').PromptRequest | null>(null)
  const popovers = usePlugins((s) => s.popovers)
  const closePopover = usePlugins((s) => s.closePopover)
  const askReq = useAsk((s) => s.req)
  useEffect(() => {
    init()
    usePlugins.getState().init()
    useUsage.getState().init()
    useUpdate.getState().init()
    watchTaskbarBadge()
    window.ct.plugins.onRun((r) => { const s = useWorkbench.getState(); if (s.activeProjectId) s.runCommand(s.activeProjectId, r.cwd, [...(r.command ? [r.command] : []), ...(r.argv ?? [])], r.tab, r.id ? { id: r.id, label: r.label } : undefined) })
    window.ct.plugins.onNotify((n) => { new Notification(n.title, { body: n.body }) })
    window.ct.plugins.onOpenFile((path) => { const s = useWorkbench.getState(); if (s.activeProjectId) s.openFile(s.activeProjectId, path) })
    window.ct.plugins.onPrompt((r) => setPrompt(r))
    // commands plugins started (terminal.run): the list goes to the host at each change, stop = Ctrl+C in the tab
    let lastRuns = ''
    useWorkbench.subscribe((s) => {
      const runs = s.projects.flatMap((p) => p.tabs.filter((t) => t.run && t.alive).map((t) => ({ id: t.run!.id, tabId: t.id, cwd: t.cwd, command: t.lastCommand, label: t.run!.label, started: t.run!.started })))
      const key = JSON.stringify(runs)
      if (key !== lastRuns) { lastRuns = key; window.ct.plugins.runs(runs) }
    })
    const tabOfRun = (id: string) => { for (const p of useWorkbench.getState().projects) { const t = p.tabs.find((x) => x.run?.id === id); if (t) return { p, t } } return null }
    window.ct.plugins.onStopRun((id) => { const f = tabOfRun(id); if (f?.t.ptyId) window.ct.pty.write(f.t.ptyId, '\x03') })
    window.ct.plugins.onShowRun((id) => { const f = tabOfRun(id); if (f) { const s = useWorkbench.getState(); s.setActiveProject(f.p.id); s.setCurrentTab(f.p.id, f.t.id) } })
    window.ct.plugins.onOpenDiff((r) => { const s = useWorkbench.getState(); if (s.activeProjectId) s.openDiff(s.activeProjectId, r) })
    window.ct.plugins.onOpenProject(async ({ path, claude, resume, prompt }) => {
      const s = useWorkbench.getState()
      // git prints Windows paths with forward slashes
      const root = window.ct.platform === 'win32' ? path.replace(/\//g, '\\') : path
      const same = (r: string | null) => !!r && r.replace(/[\\/]+$/, '').toLowerCase() === root.replace(/[\\/]+$/, '').toLowerCase()
      const open = s.projects.find((p) => same(p.root))
      if (open) s.setActiveProject(open.id)
      const p = open ?? s.newProject(null)
      if (!open) s.setRoot(p.id, root)
      // a session to resume or a prompt to send get a Claude tab of their own, even in a project already open
      if (!resume && !prompt && (open || !claude)) return
      const tabId = await useWorkbench.getState().newTab(p.id, 'claude', open?.root ?? root, resume)
      if (prompt && tabId) await sendWhenReady(tabId, prompt)
    })
    if (import.meta.env.DEV || window.ct.debug) (window as any).__ct = useWorkbench
    if (import.meta.env.DEV || window.ct.debug) (window as any).__ct_picker = { switchModel, switchEffort, screenRows, usePickerNotice }
    if (import.meta.env.DEV || window.ct.debug) (window as any).__ct_state = () => {
      const s = useWorkbench.getState()
      return { activeProjectId: s.activeProjectId, leftActivity: s.leftActivity, rightActivity: s.rightActivity, showSettings: s.showSettings, sessionMode: s.sessionMode,
        projects: s.projects.map((p) => ({ id: p.id, root: p.root, currentTabId: p.currentTabId, selectedPath: p.selectedPath, tabs: p.tabs.map((t) => ({ id: t.id, kind: t.kind, title: t.title, cwd: t.cwd, alive: t.alive, busy: t.busy, lastCommand: t.lastCommand, lastExit: t.lastExit, claudeRunning: t.claudeRunning, attention: t.attention, path: t.path, dirty: t.dirty, changedOnDisk: t.changedOnDisk, session: t.session && { id: t.session.sessionId, events: t.session.events.length, files: Object.keys(t.session.files).length, planMode: t.session.planMode, tokens: [t.session.inputTokens, t.session.outputTokens] } })) })) }
    }
  }, [])
  const look = theme ? settings?.looks?.[theme.type] : undefined
  useEffect(() => { if (theme) applyTheme(theme, { look, uiFont: settings?.uiFont }) }, [theme, JSON.stringify(look), settings?.uiFont])
  const activeRoot = project?.root ?? null
  useEffect(() => { window.ct.plugins.projectChanged(activeRoot) }, [activeRoot])
  const language = settings?.language ?? 'system'
  setLanguage(language)
  useEffect(() => { setLanguage(language) }, [language])

  // shortcuts (keymap: preset defaults, overridable in the settings); a terminal hands over the ones it leaves to the app
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useWorkbench.getState()
      if (e.key === 'Escape' && st.showSettings) { st.setShowSettings(false); return }
      if ((e.target as HTMLElement)?.closest?.('.key-recorder')) return
      const inTerminal = !!(e.target as HTMLElement)?.closest?.('.xterm')
      const hit = findAction(keyEvent(e), st.settings?.keybindings ?? {}, window.ct.platform === 'darwin', { preset: st.settings?.keymapPreset, inTerminal })
      if (hit && runAppAction(hit.id)) { e.preventDefault(); return }
      // a saved prompt's own shortcut
      const prompt = hit ? null : promptForKey(keyEvent(e), inTerminal)
      if (prompt) { e.preventDefault(); runPrompt(prompt) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // a prompt saved without a key gets the next free Ctrl+Shift+digit
  useEffect(() => { numberNewPrompts() }, [settings?.prompts])

  if (!theme || !settings || !project) return null
  const mac = window.ct.platform === 'darwin'
  return (
    <div className="wb">
      <div className={'title ' + (mac ? 'mac' : 'win')}>
        <div className="ptabs">
        {projects.map((p) => (
          <div key={p.id} className={'ptab' + (p.id === activeProjectId ? ' on' : '') + drag.dropClass(p.id)} onClick={() => setActiveProject(p.id)} {...drag.props(p.id)}>
            <span style={{ display: 'inline-flex', color: p.id === activeProjectId ? 'var(--ct-accent)' : undefined }}>{Icons.folder(12)}</span>
            <span>{p.root ? p.root.split(/[\\/]/).filter(Boolean).pop() : t('Nouveau projet')}</span>
            <Decorations root={p.root} />
            {p.tabs.some((t) => t.attention) && <span className="pcount attn">{p.tabs.filter((t) => t.attention).length}</span>}
            {!p.tabs.some((t) => t.attention) && p.tabs.some(activeNow) && <span className="pcount busy" title={t('En cours')}>{p.tabs.filter(activeNow).length}</span>}
            <button className="close" onClick={(e) => { e.stopPropagation(); closeProject(p.id) }} title={t('Fermer le projet')}>{Icons.x(10)}</button>
          </div>
        ))}
        <button className="plus" title={withShortcut(t('Nouveau projet'), 'app.newProject')} onClick={() => newProject(null)} style={{ width: 24, height: 24, display: 'grid', placeItems: 'center', borderRadius: 5, color: 'var(--ct-text-secondary)' }}>{Icons.plus(12)}</button>
        </div>
      </div>
      <div className="body">
        {project.root && <LeftActivityBar />}
        {project.root && <LeftSidebar project={project} />}
        {project.root ? <Center project={project} /> : <Welcome project={project} />}
        <RightSidebar />
        <RightActivityBar />
      </div>
      {popovers.map((p) => <PluginPopover key={p.id} id={p.id} anchorViewId={p.anchorViewId} model={p.model} onClose={() => closePopover(p.id)} />)}
      {prompt && <PromptModal req={prompt} onDone={(v) => { window.ct.plugins.promptReply(prompt.id, v); setPrompt(null) }} />}
      <Palette />
      {askReq && <PromptModal req={{ id: 0, title: askReq.title, placeholder: askReq.placeholder, emptyLabel: askReq.emptyLabel }} onDone={(v) => useAsk.getState().done(v)} />}
      {showSettings && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowSettings(false) }}>
          <div className="modal"><SettingsPage onClose={() => setShowSettings(false)} /></div>
        </div>
      )}
    </div>
  )
}

/** Themed text prompt used by plugins (ctx.ui.prompt). */
function PromptModal({ req, onDone }: { req: import('@shared/plugins').PromptRequest; onDone: (v: string | null) => void }) {
  const [value, setValue] = useState('')
  if (req.choice) return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onDone(null) }} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onDone(null) } }}>
      <div className="modal prompt">
        <div className="island">
          <div className="hdr"><span>{req.title}</span></div>
          <div className="content" style={{ padding: 12, gap: 8 }}>
            {req.placeholder && <div className="hint">{req.placeholder}</div>}
            {(req.options ?? []).map((o, i) => <button key={o} autoFocus={i === 0} className={'btn' + (i === 0 ? ' primary' : '')} style={{ justifyContent: 'flex-start' }} onClick={() => onDone(o)}>{o}</button>)}
            <div className="row-actions" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={() => onDone(null)}>{t('Annuler')}</button></div>
          </div>
        </div>
      </div>
    </div>
  )
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onDone(null) }}>
      <div className="modal prompt">
        <div className="island">
          <div className="hdr"><span>{req.title}</span></div>
          <div className="content" style={{ padding: 12, gap: 10 }}>
            <input autoFocus list={req.options ? 'prompt-options' : undefined} placeholder={req.placeholder} value={value} onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (value.trim() || req.emptyLabel)) onDone(value); if (e.key === 'Escape') { e.stopPropagation(); onDone(null) } }} />
            {req.options && <datalist id="prompt-options">{req.options.map((o) => <option key={o} value={o} />)}</datalist>}
            {req.options && req.options.length > 0 && (
              <div className="plan-pick" style={{ padding: 0 }}>{req.options.slice(0, 12).map((o) => <button key={o} className="linkbtn" onClick={() => onDone(o)}>{o}</button>)}</div>
            )}
            <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => onDone(null)}>{t('Annuler')}</button>
              <button className="btn primary" disabled={!value.trim() && !req.emptyLabel} onClick={() => onDone(value)}>{!value.trim() && req.emptyLabel ? req.emptyLabel : 'OK'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
