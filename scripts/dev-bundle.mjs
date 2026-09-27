// Dev only (macOS): the menu bar and Dock read the name and icon from node_modules' Electron.app, so rename it
// to ClaudeTerm and give it our icon. Packaged builds are unaffected (electron-builder writes its own bundle).
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

if (process.platform !== 'darwin') process.exit(0)
const app = join(import.meta.dirname, '..', 'node_modules', 'electron', 'dist', 'Electron.app')
const plist = join(app, 'Contents', 'Info.plist')
if (!existsSync(plist)) process.exit(0)
for (const key of ['CFBundleName', 'CFBundleDisplayName']) execFileSync('plutil', ['-replace', key, '-string', 'ClaudeTerm', plist])
copyFileSync(join(import.meta.dirname, '..', 'build', 'icon.icns'), join(app, 'Contents', 'Resources', 'electron.icns'))
// Launch Services caches bundle names and icons
execFileSync('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', app])
console.log('dev bundle: Electron.app renamed ClaudeTerm')
