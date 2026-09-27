import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared') } },
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // the git plugin must stay at 100 %: parsers and model are pure and fully exercised
      include: ['resources/plugins/git/git.js', 'resources/plugins/git/model.js', 'resources/plugins/git/graph.js'],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
      reporter: ['text-summary', 'text'],
    },
  },
})
