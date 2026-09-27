import { describe, it, expect } from 'vitest'
import { shellEscapePath, pathsForPrompt } from '../src/shared/paths'
describe('paths for the prompt', () => {
  it('escapes shell-special characters like a terminal drop', () => {
    expect(shellEscapePath('/Users/j/My Project/a (1).png')).toBe('/Users/j/My\\ Project/a\\ \\(1\\).png')
    expect(shellEscapePath("/x/it's")).toBe("/x/it\\'s")
    expect(pathsForPrompt(['/a b', '/c'])).toBe('/a\\ b /c ')
  })
})
