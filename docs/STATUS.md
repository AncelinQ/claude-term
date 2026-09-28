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
- **Plugin catalogue** (DESIGN.md §7.1): `registry.json` from `settings.pluginRegistry` (Réglages > Plugins),
  Plugins island with Installés / Catalogue tabs, install with sha256 check + native permission approval,
  install from a .tgz URL, update (asks again only when permissions grow), enable / disable and uninstall
  without restart, approval of pending permissions. `services/tar.ts` (safe .tgz reader), `services/plugin-store.ts`,
  `shared/plugin-registry.ts`, tests in `tests/plugin-store.test.ts`. Checked end to end with a local `file:` catalogue.
- **Packaging**: electron-builder (dmg / nsis / AppImage), GitHub Actions workflow, `CT_CDP_PORT` test hooks.
- **Terminal bubble** (top right of a terminal, like the markdown modes): shell = running command or exit code;
  Claude = attention, permission / plan mode, running tools, model (menu: `/model <alias>` typed in the tab, the
  default of ~/.claude/settings.json put back since Claude Code saves it), context % (status line figure per session,
  else ≈ from the transcript), tokens. The island header keeps only the file state.
- **Lanceur**: collapsed groups (state kept), filter, "En cours" group with stop (Ctrl+C) / show; plugin API
  `terminal.run` returns an id, `terminal.runs / onDidChangeRuns / stop / show`. package.json gets WebStorm-like ▶ in
  the editor gutter (■ while running), through the Lanceur.
- Claude icon: the terminal icon in orange (`Icons.claude`) everywhere it means Claude; skills keep the sparkle.
- **Claude panel** (right bar): subscription usage from Claude Code's status line (5 h session, week, per-model
  week, extra credit; gauges with reset delays), Claude Code version and default model (global data only), a
  button to the artifacts gallery (claude.ai/code/artifacts, default browser). The status line is ours only
  on demand (`services/usage.ts`: a script copies the JSON Claude Code pipes to it into `userData/usage/status.json`,
  prints nothing). Artifacts cannot be listed natively: the Artifact tools exist only in interactive sessions, not in
  `claude -p`.
- **Automatic updates**: GitHub releases of `sunstan/claude-term` (v2 on `main` since 2026-09-27, Swift v1 kept in
  the `v1` branch and `v1-swift` tag). Windows / Linux through electron-updater; macOS through our own updater
  (unsigned builds): feed, zip sha512, bundle version check, swap after quit + reopen. Checked end to end with a
  local feed (packaged 2.0.0 → 2.0.1). Settings › Général › Mises à jour; download icon in the right bar when ready.
  CI workflow `release`: every push to main → next version (last tag + 1 patch, or package.json when higher) →
  draft release → 3 platforms → published when all succeed. First release: v2.0.0.
- **App icon**: new logo (`build/src/logo.svg`, 800 px full bleed) placed on the macOS grid in
  `build/src/icon.svg` (824 px body, 100 px margin on 1024); `build/icon.png` / `icon.icns` generated from it.
- **Tests**: 72 (vitest). UI checked through `scripts/ui.ts` (CDP) + screenshots.

## Open / next

0. **Next task: Linear plugin**, first catalogue plugin, in its own repo: needs the `fetch` (network permission,
   domain-scoped) and `secrets` (safeStorage) APIs in the host first. Then add it to `sunstan/claudeterm-plugins`
   `registry.json` with the plugin's release .tgz + sha256 (repo created 2026-09-27, empty registry, local clone in `../claudeterm-plugins`).
1. **Bug to reproduce**: the user sees the right icon column change size "when a tab is selected"; not reproduced
   (measured 38 px in every state). Waiting for before/after screenshots.
2. Find bar for terminals (xterm search addon).
3. Plugins: Thèmes plugin (list, preview, VS Code import); `network` (domain-scoped, through the plugin session) and
   `secrets` permissions for the Linear plugin.
4. Windows: test on a real machine (native and WSL), `hook.cmd`, screen capture, Ctrl shortcuts typed in a
   terminal go to the shell instead of the app.
5. Formatter beyond Monaco's languages (Prettier); content search (rg) in the search island.
6. Windows and Linux updates are untested on real machines (electron-updater, unsigned NSIS / AppImage).

## Gotchas

- Catalogue approval / uninstall use native dialogs from main: `scripts/ui.ts` cannot click them (osascript has no
  Accessibility access), the user has to.

- Built-in plugins run in main: changes in `resources/plugins` need an app restart (no HMR).
- Monaco 0.57 worker paths: `monaco-editor/editor/editor.worker.js?worker`.
- Renderer Vite root is `src/renderer`: globs into node_modules must be relative.
- Electron 44 clipboard API is async (W3C-like).
- zustand selectors must not return new arrays (use `useMemo` over the raw slice).
