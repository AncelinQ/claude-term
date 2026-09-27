# ClaudeTerm v2 — design

Cross-platform workbench for Claude Code (macOS, Windows, Linux). Electron, architecture
borrowed from VS Code (contribution points, isolated extension host, theme format), code of
our own. Successor of the native Swift v1 (`../claude-term`), whose knowledge of Claude Code's
files carries over.

## 1. Goals

- Claude Code is the main feature: terminal on top, session intelligence (plan, activity,
  files touched, permissions waiting) around it, read from what Claude Code already writes.
- Custom, token-driven UI ("islands"), themes compatible with VS Code themes.
- Plugins in JS/TS with a real API, `claude.*` being the differentiator.
- One codebase, one team (Windows users included).

Non-goals for now: git panel, Jira, being a general-purpose editor (Monaco covers "read and
fix a file while Claude works"; LSP is a later option).

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Shell | Electron 44, electron-vite 5 | cross-platform, VS Code's own base |
| UI | React 19 + TypeScript, CSS variables for tokens | custom UI, live theming |
| Terminal | @xterm/xterm 6 + WebGL addon, node-pty 1.1 | VS Code's terminal, no latency issue |
| Editor | monaco-editor | VS Code's editor: TextMate-grade highlighting, themes, find, multi-cursor |
| State | zustand | small, no boilerplate |
| Tests | vitest | main-process services and pure logic |
| Packaging | electron-builder | dmg / nsis / AppImage |
| Claude | `claude` CLI in a pty; `@anthropic-ai/claude-agent-sdk` for headless runs (plugins) | same binary the user has |

## 3. Processes

```
main (Node)                      renderer (Chromium, sandboxed)          extension host (utilityProcess)
  window, menus                    workbench UI                            plugin runtime, one vm per plugin
  PtyService (node-pty)            xterm views                             API implementation (RPC to main)
  FsService (readdir, watch)       Monaco                                  permissions enforced in main
  ClaudeDataService                stores (zustand)
    transcripts, sessions-index,
    file-history, plans, hooks
  SettingsService (userData/settings.json)
  ThemeService (themes dir)
  ShellIntegration (OSC 7770)
```

Renderer ↔ main through a typed IPC contract (`src/shared/ipc.ts`), exposed by the preload as
`window.ct`. No Node in the renderer. Streams (pty data, transcript events) are push channels.

## 4. Layout

```
┌──┬────────────────┬──────────────────────────────────┬──────────────┬─┐
│A │ island: finder │ tabs: ✳ claude · zsh · a.json    │ island       │a│
│c │────────────────│ terminal / editor (top)          │ (process…)   │c│
│t │ island: links  │──────────────────────────────────│              │t│
│  │                │ session block (plan/activity/    │              │ │
│  │                │ files), collapsible              │              │ │
├──┴────────────────┴──────────────────────────────────┴──────────────┴─┤
│ status bar                                                            │
└───────────────────────────────────────────────────────────────────────┘
```

- **Chrome**: macOS `titleBarStyle: hiddenInset` (traffic lights kept), Windows/Linux
  `titleBarStyle: hidden` + `titleBarOverlay` (native caption buttons over our title strip).
  The top strip holds the project tabs and is the drag region. Menus: native menu bar on macOS,
  hidden on Windows (commands via palette and the ⋯ button), like VS Code's custom title bar.
- **Left activity bar** (44 px): Explorer (2 islands: Finder, Linked folders), Search,
  Skills (project), MCP (project + personal), Plugins. Everything project-bound is on the left.
  No "npm scripts" entry (decided 2026-09-27): a later **runnables plugin** will detect what a
  project can run (npm scripts, make targets, python entry points, cargo…) and offer it in one place. Click active = collapse. The left bar and sidebar are **project-bound**:
  hidden while the active project has no folder (welcome screen).
- **App settings**: gear button at the top right of the title strip (not in an activity bar);
  opens the Settings center tab.
- **Right activity bar** (28 px, secondary): Process, History, Skills (personal + plugins). **Global**, not bound to a
  project: always visible and usable, welcome screen included.
- **Center**: tab bar (terminal + editor tabs interleaved), terminal/editor on top, session
  block below.
- **Status bar**: full width; core items + plugin items.
- **Welcome screen** (project without a folder): "Open a folder…" and the **recent projects** list
  (name, path, Claude sessions badge), one click opens. On first launch the recents of the Swift v1
  are imported from its preferences (macOS only).
- **Islands**: `--island-bg`, 1 px `--island-border`, radius 8, gutter 8 over `--window-bg`,
  no shadow, shared header (icon, title, actions, ⓘ, collapse).

## 5. Themes

Same model as VS Code where it matters, so their themes load as-is:
`{ id, name, type, colors: { "editor.background": …, "sideBar.background": …, "terminal.ansiRed": … },
tokenColors: [...] }`. Our own tokens (`island.*`, `activity.*`, `status.*`…) are derived from
VS Code keys when absent (`sideBar.background` → `island.bg`, `activityBar.*`, `statusBar.*`,
`tab.*`, `terminal.*`). Applied as CSS variables on `:root`; Monaco gets `tokenColors` through
`monaco.editor.defineTheme`; xterm gets `terminal.ansi*`.
Built-ins: ClaudeTerm Dark, ClaudeTerm Light. User themes in `userData/themes/`, plugin themes in
their folder. Follow-system pairing (dark/light) or fixed.

## 6. Settings

Center tab (⌘,), sections + search: Général, Apparence, Éditeur, Terminal, Claude Code
(`~/.claude/settings.json` form), Notifications, Plugins, Raccourcis, **Windows** (`claude`
location: native or WSL distro; in WSL mode the pty runs `wsl.exe -d <distro>` and `~/.claude`
is read through `\\wsl$\<distro>\home\<user>\.claude`).
Stored in `userData/settings.json` (which also keeps the workbench `layout`: sidebar widths, island
heights, collapsed states, so the app reopens as it was left); plugins declare a schema (`contributes.settings`) and the form
is generated.

## 7. Plugins

Folder `userData/plugins/<id>/` with `plugin.json` (id, version, engine, activation,
permissions, contributes: commands, activity, views, status, menus, themes, settings) and
`main.js`. Runs in the extension host (one `vm` context per plugin, host in an Electron
`utilityProcess`). API namespaces on `ctx`: `commands`, `ui` (activity, view, status, notify,
confirm, prompt, menu), `views` (declarative: tree, list, table, detail, markdown, diff, form,
toolbar, empty, progress — rendered by the workbench), `workspace`, `terminal`, `process`,
`fetch`, `storage`, `secrets` (safeStorage/keychain), `settings`, `themes`, `claude`
(sessions, events: message/tool/file/plan/attention/start/stop, `prompt`, `run` headless via the
Agent SDK, skills/mcp registration), `events`. Typings shipped (`claudeterm.d.ts`).
Permissions declared and approved at enable time, enforced in main (network domain-scoped,
process, secrets, fs scope).
Webviews for plugin UI: postponed on purpose.
First plugins: **Thèmes** (built-in: list, preview, apply, import VS Code theme/marketplace URL)
and **Linear** (API key in secrets, GraphQL, "Mes issues", "Démarrer avec Claude").

## 8. Claude Code integration (ported from v1)

- Claude tab = pty running `claude` (or `claude --resume <id>`) in the project cwd.
- Transcript: `~/.claude/projects/<encoded cwd>/<session>.jsonl` tailed for messages, tool
  calls, files touched, tokens, plan mode, permission mode; encoding of the cwd is ASCII-only
  (`[^a-zA-Z0-9]` → `-`). Claimed transcripts: newest file created after the tab start.
- Files touched + diffs: `~/.claude/file-history/<session>` backups, and `toolUseResult.bashEditDiff`.
- Plans: `~/.claude/plans`. Sessions index: `sessions-index.json` (deletion allowed).
- Hooks `Notification` and `Stop` installed only from settings, spooling events into
  `userData/events`; routed to tabs (attention badge, macOS/Windows notifications).
- Shell integration: OSC 7770 from a private zsh rc (busy state, last command, exit code);
  PowerShell profile equivalent on Windows.
- Writes are limited to: `~/.claude/settings.json` (form), `sessions-index.json`,
  `<project>/.claude/settings.local.json` (links), `<project>/.mcp.json`. MCP user scope goes
  through `claude mcp add|remove`, never `~/.claude.json`.

## 9. Phases

| Phase | Content | Result |
|---|---|---|
| 0 | scaffold, window chrome, islands, tokens + 2 themes, activity bars, status bar, settings store | empty but themed workbench |
| 1 | PtyService + xterm tabs (Claude / shell), project tabs, Finder island, shell integration | usable terminal for Claude |
| 2 | ClaudeDataService: transcript tailing, session block (plan / activity / files+diff), hooks, notifications | v1 parity on the Claude side |
| 3 | Monaco editor tabs, search island, MCP, skills, links, history, process | v1 parity (minus npm scripts) |
| 4 | settings UI, Windows/WSL mode, packaging (dmg, nsis) | team can install |
| 5 | extension host + API + views renderer + Plugins island + Thèmes plugin | plugins |
| 6 | Linear plugin, `claude.run` via Agent SDK | Claude-driven workflow |

## 10. Repository layout

```
src/main/        services (pty, fs, claude-data, settings, themes, shell-integration), window, menu, ipc
src/preload/     contextBridge → window.ct (typed)
src/renderer/    workbench/ (layout, activity bars, islands, status), terminal/, editor/, theme/, stores/, views/
src/shared/      ipc contract, types, claude formats (pure, tested)
src/host/        extension host (phase 5)
resources/       themes/, icons, shell integration scripts
docs/            this doc, API reference (phase 5)
```
