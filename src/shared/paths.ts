/** Escapes a path the way a terminal drag-and-drop does (backslash before shell-special characters). */
export function shellEscapePath(p: string): string {
  return p.replace(/([ '"()\[\]&;$<>|`\\*?{}~#!])/g, '\\$1')
}
export function pathsForPrompt(paths: string[]): string {
  return paths.map(shellEscapePath).join(' ') + ' '
}
