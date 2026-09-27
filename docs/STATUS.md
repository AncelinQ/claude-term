# ClaudeTerm v2 — status (2026-09-27)

Handoff for the next session. Design: `docs/DESIGN.md`. Working rules: `CLAUDE.md`.

## Done

- **Workbench**: Electron + React + TS; islands UI (no borders), activity bars (left = project, right = global,
  38 px column, first icon aligned on the island header), centered project tabs, no status bar (tab state in the
  center header), resizable everything persisted in `settings.json > layout`.
- **Themes**: VS Code format + own tokens, one hue per theme (lightness only varies), ClaudeTerm Dark / Light,
  single selector (follow system or a theme).
- **Terminal**: node-pty + xterm (WebGL), Claude / shell tabs, shell integration (OSC 7770 busy/exit, OSC 7 cwd),
  claude from the login-shell PATH, WSL mode prepared.
- **Claude**: transcript tracking, session block (Plan / Activité / Fichiers with per-session diffs), hooks
  (Notification, Stop) → attention, OS notifications, dock badge; attachments (drop, ⌘V image, ⌥⌘S capture).
- **Editor**: Monaco tabs, dirty by content, auto save on focus loss, confirm on close, reload on external change,
  images, markdown code / split / preview (floating switch, moves under the find bar), JetBrains-like find /
  replace bar (⌘F / ⌘R), side-by-side diff tabs, separate editor fonts, format on save option.
- **Islands**: explorer + linked folders, search (file names), project history (left) / all history (right),
  skills (project / personal / plugins), MCP (project / user), Claude processes.
- **Settings modal**: Général (language fr/en/system), Apparence, Éditeur, Raccourcis (JetBrains keymap, recorder,
  conflicts, reset), Terminal, Claude Code (`~/.claude/settings.json` form), Notifications, Windows.
- **Icons**: Catppuccin (MIT) Mocha/Latte, lavender neutrals recolored to the theme grey; Lucide for UI icons.
- **Plugins**: host in main (vm per plugin), declarative views (list, tree, markdown, diff, stack, detail, graph,
  checkboxes, footer, context menus, search, popover, bottom placement), API typings `resources/plugins/claudeterm.d.ts`.
  - **Lanceur**: npm (workspaces), make, cargo, go, python, shell scripts.
  - **Git**: checkbox commit panel (group by directory), branches (menu: switch, new from, diff, pull, push, rename,
    safe delete), branch popover, commits in the bottom block with graph + files + details, diff tabs. Every write
    is a visible `git` command, nothing destructive. Parsers, model and graph at **100 % coverage** (`npm run test:git`).
- **Packaging**: electron-builder (dmg / nsis / AppImage), GitHub Actions workflow, `CT_CDP_PORT` test hooks.
- **Tests**: 57 (vitest). UI checked through `scripts/ui.ts` (CDP) + screenshots.

## Open / next

1. **Bug to reproduce**: the user sees the right icon column change size "when a tab is selected"; not reproduced
   (measured 38 px in every state). Waiting for before/after screenshots.
2. Find bar for terminals (xterm search addon).
3. Plugins: Thèmes plugin (list, preview, VS Code import), Plugins island (enable/disable, install from a git
   repo), host in a utilityProcess before opening to third-party plugins; Linear plugin later.
4. Windows: test on a real machine (native and WSL), `hook.cmd`, screen capture, Ctrl shortcuts typed in a
   terminal go to the shell instead of the app.
5. Formatter beyond Monaco's languages (Prettier); content search (rg) in the search island.
6. Push the repo to a remote so the CI builds the installers (no remote yet).

## Gotchas

- Built-in plugins run in main: changes in `resources/plugins` need an app restart (no HMR).
- Monaco 0.57 worker paths: `monaco-editor/editor/editor.worker.js?worker`.
- Renderer Vite root is `src/renderer`: globs into node_modules must be relative.
- Electron 44 clipboard API is async (W3C-like).
- zustand selectors must not return new arrays (use `useMemo` over the raw slice).
