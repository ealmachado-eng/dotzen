import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    // extension.ts imports the `vscode` module (unavailable outside the
    // extension host); every other module is pure and tested directly.
    include: ['src/**/*.test.ts'],
  },
})
