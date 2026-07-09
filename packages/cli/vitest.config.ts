import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/cli/main.ts'],
      thresholds: {
        // Correctness-critical core carries the floor; see doc 07.
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
})
