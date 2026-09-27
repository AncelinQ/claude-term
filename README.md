# ClaudeTerm

A workbench for [Claude Code](https://docs.anthropic.com/en/docs/claude-code): the terminal on top,
the session's plan, activity and touched files around it, a themed "islands" UI, and plugins.
macOS, Windows and Linux (Electron).

Status: v2 rewrite in progress. See [docs/DESIGN.md](docs/DESIGN.md) for the architecture and phases.

## Develop

```
npm install
npm run dev
```

`npm run typecheck`, `npm test`, `npm run build`.

## Package

```
npm run dist:mac      # dist/ClaudeTerm-<version>-arm64.dmg (unsigned: right-click › Open the first time)
npm run dist:win      # dist/ClaudeTerm Setup <version>.exe (NSIS, run on Windows)
npm run dist:linux    # dist/ClaudeTerm-<version>.AppImage
```

Windows: Settings › Windows chooses where `claude` runs (native, or a WSL distribution).
Requirements on every platform: Node is not needed at runtime; `claude` must be installed
(`npm i -g @anthropic-ai/claude-code`) and reachable from the login shell's PATH.

## License

PolyForm Noncommercial 1.0.0.

## Third-party assets

File and folder icons: [Catppuccin Icons](https://github.com/catppuccin/vscode-icons) (MIT), Mocha and Latte flavors, vendored in `src/renderer/assets/catppuccin`.
