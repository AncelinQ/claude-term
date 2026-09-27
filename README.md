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

## Install and updates (team)

Download the installer from the [latest release](https://github.com/sunstan/claude-term/releases/latest):
`ClaudeTerm-<version>-arm64.dmg` (Apple silicon), `ClaudeTerm-<version>.dmg` (Intel), `ClaudeTerm Setup <version>.exe`,
`ClaudeTerm-<version>.AppImage`. The builds are not signed:

- macOS: move the app to Applications, then run `xattr -dr com.apple.quarantine /Applications/ClaudeTerm.app` once
  (or System Settings › Privacy & Security › Open Anyway).
- Windows: SmartScreen › More info › Run anyway.

After that the app updates itself: it checks the releases at startup and every 6 h, downloads in the background and
shows a download icon in the right bar when a version is ready (restart to install, or it installs on quit).
Settings › General › Updates: check now, turn automatic checks off.

## Release

```
npm version patch        # or minor / major: bumps package.json and creates the v<version> tag
git push --follow-tags   # the "release" workflow builds macOS / Windows / Linux and publishes the GitHub release
```

Windows: Settings › Windows chooses where `claude` runs (native, or a WSL distribution).
Requirements on every platform: Node is not needed at runtime; `claude` must be installed
(`npm i -g @anthropic-ai/claude-code`) and reachable from the login shell's PATH.

## License

PolyForm Noncommercial 1.0.0.

## Third-party assets

File and folder icons: [Catppuccin Icons](https://github.com/catppuccin/vscode-icons) (MIT), Mocha and Latte flavors, vendored in `src/renderer/assets/catppuccin`.
