# ClaudeTerm v2 — notes for Claude Code

Electron workbench for Claude Code (macOS, Windows, Linux). Successor of the native Swift v1 in
`../claude-term`; the design is in `docs/DESIGN.md` (read it before structural changes).

- Run: `npm run dev` (electron-vite, HMR for the renderer). Build: `npm run build`.
  Typecheck: `npm run typecheck`. Tests: `npm test` (vitest, `tests/`). Run all three before a commit.
- Layout: `src/main` (services + IPC, Node), `src/preload` (contextBridge → `window.ct`, typed by
  `src/shared/ipc.ts`), `src/renderer` (React, zustand store in `stores/workbench.ts`),
  `src/shared` (pure code, tested). No Node in the renderer; every capability goes through `window.ct`.
- UI: token-driven. Colors only through `var(--ct-<token>)` (tokens listed in `src/shared/theme.ts`,
  `TOKEN_FALLBACKS`), never hard-coded. Islands (`Island` component) with the shared header; no shadows.
  Icons are inline SVG in `workbench/icons.tsx` (CSP forbids icon fonts/CDNs).
- Themes: VS Code format (`colors`, `tokenColors`) + our tokens; built-ins in `resources/themes`,
  user themes in `userData/themes`. A VS Code theme must load unchanged.
- Terminals: one xterm per tab, created outside React (`terminal/TerminalView.tsx`) so switching tabs
  keeps scrollback; pty in main (`services/pty.ts`). PATH comes from the user's login shell.
- Claude Code files (`~/.claude/...`) are read, never rewritten except the ones listed in
  `docs/DESIGN.md` §8. Never `~/.claude.json`: use `claude mcp add|remove`. Strip `CLAUDE_CODE_*` env.
- Language: code, comments, commit messages, README.md and docs in English; UI strings in French
  (i18n later). README.fr.md mirrors README.md when it exists.
- Windows: `windowsMode` setting (`native` | `wsl`) decides how `claude` and shells are spawned.
- License: PolyForm Noncommercial 1.0.0.
