// Next release version: the latest v* tag + 1 patch, or package.json's version when it is higher (minor / major
// bumps are made by raising package.json). Usage in CI: node scripts/next-version.mjs → prints e.g. 2.0.3
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const parse = (v) => { const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim()); return m ? [+m[1], +m[2], +m[3]] : null }
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

export function nextVersion(tags, pkgVersion) {
  const pkg = parse(pkgVersion)
  if (!pkg) throw new Error(`package.json version invalide : ${pkgVersion}`)
  const released = tags.map(parse).filter(Boolean).sort(cmp).pop()
  if (!released) return pkg.join('.')
  const patch = [released[0], released[1], released[2] + 1]
  return (cmp(pkg, released) > 0 ? pkg : patch).join('.')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = join(import.meta.dirname, '..')
  const tags = execFileSync('git', ['tag', '--list', 'v*'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)
  console.log(nextVersion(tags, JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version))
}
