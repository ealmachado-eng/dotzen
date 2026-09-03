// Stage-and-pack: build a self-contained .vsce-pack/ tree and run vsce in
// it. Needed because the engine is a file:../cli link: `vsce package` (with
// dependency resolution) dies on the engine's qs override living in a
// foreign package.json, and --no-dependencies from the package root drops
// node_modules wholesale. A staged tree sidesteps both and makes the VSIX
// contents an explicit, reviewable list.
//
// Runtime closure copied verbatim (nothing is bundled — the engine's jiti
// spec-loader aliases @erkos/pluvian via a __dirname-relative path and
// @cdktf/hcl2json carries WASM assets; both must be REAL files):
//   @erkos/pluvian  dist/ + package.json (prod surface of packages/cli —
//                   its `files` field minus bin, which the extension never
//                   spawns)
//   jiti           (no deps)
//   @cdktf/hcl2json → fs-extra → graceful-fs, jsonfile, universalify
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'))
const pack = path.join(pkgRoot, '.vsce-pack')
const cli = path.join(pkgRoot, '..', 'cli')

const die = (msg) => {
  console.error(`package.mjs: ${msg}`)
  process.exit(1)
}

rmSync(pack, { recursive: true, force: true })
mkdirSync(path.join(pack, 'node_modules', '@erkos'), { recursive: true })

// Extension glue. The staged manifest declares REAL pinned deps matching
// the staged tree (the root manifest's file:../cli spec would not resolve
// from .vsce-pack/), so vsce's `npm list --production` validates cleanly
// and bundles exactly the staged closure — no foreign link, no qs override.
const cliPkg = JSON.parse(readFileSync(path.join(cli, 'package.json'), 'utf8'))
const stagedManifest = {
  ...pkg,
  dependencies: {
    '@cdktf/hcl2json': cliPkg.dependencies['@cdktf/hcl2json'],
    '@erkos/pluvian': cliPkg.version,
    jiti: cliPkg.dependencies.jiti,
  },
}
delete stagedManifest.overrides
writeFileSync(
  path.join(pack, 'package.json'),
  JSON.stringify(stagedManifest, null, 2) + '\n',
)
cpSync(path.join(pkgRoot, 'README.md'), path.join(pack, 'README.md'))
cpSync(path.join(pkgRoot, 'dist'), path.join(pack, 'dist'), {
  recursive: true,
})

// Engine (dereference the file: link; prod surface only).
const engine = path.join(pack, 'node_modules', '@erkos', 'pluvian')
cpSync(path.join(cli, 'package.json'), path.join(engine, 'package.json'))
cpSync(path.join(cli, 'dist'), path.join(engine, 'dist'), { recursive: true })

// Loaders + parser + their runtime deps.
for (const name of [
  'jiti',
  '@cdktf/hcl2json',
  'fs-extra',
  'graceful-fs',
  'jsonfile',
  'universalify',
]) {
  const src = path.join(pkgRoot, 'node_modules', ...name.split('/'))
  cpSync(src, path.join(pack, 'node_modules', ...name.split('/')), {
    recursive: true,
    dereference: true,
  })
}

const vsce = path.join(pkgRoot, 'node_modules', '.bin', 'vsce')
const out = `pluvian-${pkg.version}.vsix`
const r = spawnSync(vsce, ['package', '-o', path.join(pkgRoot, out)], {
  cwd: pack,
  stdio: 'inherit',
})
if (r.status !== 0) die(`vsce package failed (exit ${r.status})`)

rmSync(pack, { recursive: true, force: true })
console.log(`packaged ${out} from a staged closure — inspect it with:`)
console.log(`  unzip -l ${out}`)
