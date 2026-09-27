/** Pure helpers over the ~/.claude/settings.json object: dotted paths and hook entries. Unknown keys are untouched. */
export type Json = Record<string, any>

export function getPath(root: Json, path: string): unknown {
  let cur: any = root
  for (const k of path.split('.')) { if (cur == null || typeof cur !== 'object') return undefined; cur = cur[k] }
  return cur
}

/** Returns a copy with `value` set at `path`; `undefined` removes the key and prunes empty parents. */
export function setPath(root: Json, path: string, value: unknown): Json {
  const keys = path.split('.')
  const rec = (obj: Json, i: number): Json => {
    const d = { ...obj }
    if (i === keys.length - 1) { if (value === undefined) delete d[keys[i]]; else d[keys[i]] = value; return d }
    const child = rec(typeof d[keys[i]] === 'object' && d[keys[i]] ? d[keys[i]] : {}, i + 1)
    if (Object.keys(child).length === 0) delete d[keys[i]]; else d[keys[i]] = child
    return d
  }
  return rec(root, 0)
}

export const HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'PermissionRequest', 'Notification', 'Stop', 'SubagentStop', 'UserPromptSubmit', 'SessionStart', 'SessionEnd', 'PreCompact']

export interface HookEntry { event: string; group: number; index: number; matcher: string; command: string }

/** Command hooks, flattened: { event: [ { matcher, hooks: [ { type: 'command', command } ] } ] }. */
export function hookEntries(root: Json): HookEntry[] {
  const out: HookEntry[] = []
  const h = root.hooks
  if (!h || typeof h !== 'object') return out
  for (const event of Object.keys(h).sort()) {
    const groups = Array.isArray(h[event]) ? h[event] : []
    groups.forEach((g: any, gi: number) => {
      const hooks = Array.isArray(g?.hooks) ? g.hooks : []
      hooks.forEach((hk: any, hi: number) => { if (hk?.type === 'command') out.push({ event, group: gi, index: hi, matcher: g.matcher ?? '', command: hk.command ?? '' }) })
    })
  }
  return out
}

function mutateHooks(root: Json, body: (h: Json) => void): Json {
  const h = structuredClone(root.hooks ?? {})
  body(h)
  const r = { ...root }
  if (Object.keys(h).length) r.hooks = h; else delete r.hooks
  return r
}

export function setHookCommand(root: Json, e: HookEntry, command: string): Json {
  return mutateHooks(root, (h) => { const hk = h[e.event]?.[e.group]?.hooks?.[e.index]; if (hk) hk.command = command })
}
export function setHookMatcher(root: Json, e: HookEntry, matcher: string): Json {
  return mutateHooks(root, (h) => { const g = h[e.event]?.[e.group]; if (!g) return; if (matcher) g.matcher = matcher; else delete g.matcher })
}
export function removeHook(root: Json, e: HookEntry): Json {
  return mutateHooks(root, (h) => {
    const groups = h[e.event]; const g = groups?.[e.group]
    if (!g?.hooks) return
    g.hooks.splice(e.index, 1)
    if (g.hooks.length === 0) groups.splice(e.group, 1)
    if (groups.length === 0) delete h[e.event]
  })
}
export function addHook(root: Json, event: string, matcher = '', command = ''): Json {
  return mutateHooks(root, (h) => {
    const groups = Array.isArray(h[event]) ? h[event] : (h[event] = [])
    const g: Json = { hooks: [{ type: 'command', command }] }
    if (matcher) g.matcher = matcher
    groups.push(g)
  })
}
/** Moving to another event = remove here, append there as its own group. */
export function setHookEvent(root: Json, e: HookEntry, event: string): Json {
  if (event === e.event) return root
  return addHook(removeHook(root, e), event, e.matcher, e.command)
}

export const MODELS = ['', 'fable[1m]', 'fable', 'opus[1m]', 'opus', 'sonnet', 'haiku']
export const EFFORTS = ['', 'low', 'medium', 'high', 'xhigh', 'max']
export const PERMISSION_MODES = ['', 'default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions']
