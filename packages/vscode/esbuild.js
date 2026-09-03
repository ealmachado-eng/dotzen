// @ts-check
// Bundle the extension GLUE only. The engine ships as real files inside the
// VSIX (node_modules/@erkos/pluvian): its jiti spec-loader aliases
// `@erkos/pluvian` via a __dirname-relative path, and @cdktf/hcl2json
// carries WASM assets — neither survives being inlined into one bundle.
// Keeping them external (resolved at require-time from node_modules)
// preserves both, with zero user-side setup.
const esbuild = require('esbuild')

const production = process.argv.includes('--production')

esbuild
  .build({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    external: ['vscode', '@erkos/pluvian', 'jiti', '@cdktf/hcl2json'],
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    minify: production,
    sourcemap: !production,
    logLevel: 'info',
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
