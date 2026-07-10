import * as fs from 'fs'
import * as path from 'path'
import { parse as hcl2json } from '@cdktf/hcl2json'
import { Result, ok, err } from '../result/result'
import { DotzenError } from '../result/errors'
import { NormalizedResource } from './model'
import {
  normalize,
  buildScope,
  resolveRaw,
  Hcl2JsonRoot,
  Scope,
} from './normalize'

function findTfFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { recursive: true }) as string[]
  return entries.filter((e) => e.endsWith('.tf')).map((e) => path.join(dir, e))
}

const toPosix = (p: string): string => p.split(path.sep).join('/')

interface ParsedFile {
  file: string
  text: string
  parsed: Hcl2JsonRoot
}

/** Parse every `.tf` under `dir` (no normalization). */
async function parseDir(
  dir: string,
): Promise<Result<ParsedFile[], DotzenError>> {
  if (!fs.existsSync(dir)) return err({ kind: 'PathNotFound', path: dir })
  const out: ParsedFile[] = []
  for (const file of findTfFiles(dir)) {
    const text = fs.readFileSync(file, 'utf8')
    try {
      const parsed = (await hcl2json(path.basename(file), text)) as Hcl2JsonRoot
      out.push({ file, text, parsed })
    } catch (e) {
      return err({
        kind: 'ParseFailed',
        file,
        detail: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return ok(out)
}

// Keys on a `module` block that are meta, not `var` inputs (doc 08).
const MODULE_META = new Set([
  'source',
  'version',
  'count',
  'for_each',
  'providers',
  'depends_on',
  'lifecycle',
])

// A local relative source we can follow (doc 08 v1: local sources only).
const isLocalSource = (s: unknown): s is string =>
  typeof s === 'string' && (s.startsWith('./') || s.startsWith('../'))

/**
 * Module-following (doc 08). For each local `module { source, <inputs> }`
 * call in the caller's files, parse the module dir and normalize its
 * resources with a scope = the module's own defaults/locals overlaid with
 * the caller's inputs (resolved in the caller's scope) as `var.*`. This is
 * what turns caller-`var` values (cidrs, tags) into concrete verdicts.
 * v1: local sources, single level, no count/for_each.
 */
async function followModules(
  callerFiles: ParsedFile[],
  rootDir: string,
  projectRoot: string,
  callerScope: Scope,
  environmentOverride: string | undefined,
): Promise<Result<NormalizedResource[], DotzenError>> {
  const rootRel = toPosix(path.relative(projectRoot, rootDir))
  const out: NormalizedResource[] = []

  for (const { file, parsed } of callerFiles) {
    for (const [, calls] of Object.entries(parsed.module ?? {})) {
      for (const raw of Array.isArray(calls) ? calls : []) {
        const block = (raw ?? {}) as Record<string, unknown>
        if (!isLocalSource(block.source)) continue // remote → not followed

        const moduleDir = path.resolve(path.dirname(file), block.source)
        // Confine to the scanned project; never escape it.
        if (path.relative(projectRoot, moduleDir).startsWith('..')) continue
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- moduleDir confined to projectRoot above
        if (!fs.existsSync(moduleDir)) continue

        const parsedModule = await parseDir(moduleDir)
        if (!parsedModule.ok) return parsedModule

        // Module scope: its own defaults/locals, then caller inputs win.
        const moduleScope = buildScope(parsedModule.value.map((f) => f.parsed))
        for (const [name, value] of Object.entries(block)) {
          if (MODULE_META.has(name)) continue
          const resolved = resolveRaw(value, callerScope)
          moduleScope.set(
            `var.${name}`,
            resolved !== undefined ? resolved : value,
          )
        }

        for (const m of parsedModule.value) {
          const modRel = toPosix(path.relative(projectRoot, m.file))
          const trace = rootRel ? `${rootRel} › ${modRel}` : modRel
          out.push(
            ...normalize(
              m.parsed,
              trace,
              m.text,
              moduleScope,
              environmentOverride,
            ),
          )
        }
      }
    }
  }
  return ok(out)
}

/**
 * Read a terraform directory, parse each .tf via the official parser
 * (hcl2json / WASM), and normalize into dotzen's model. Async because
 * the WASM parser is async. Reported file paths are made relative to
 * `projectRoot` (defaults to `dir`) so output is readable and portable —
 * and, for multi-root layouts, shows which root each finding came from.
 * A single `parseTf` call builds ONE scope, so calling it once per root
 * keeps each root's `var`/`local` values isolated. Local `module {}` calls
 * are followed (doc 08), evaluating the module's resources with the
 * caller's inputs threaded in as `var.*`.
 */
export async function parseTf(
  dir: string,
  projectRoot: string = dir,
  environmentOverride?: string,
): Promise<Result<NormalizedResource[], DotzenError>> {
  const parsedFiles = await parseDir(dir)
  if (!parsedFiles.ok) return parsedFiles

  // Build the cross-file var/local scope, then normalize direct resources.
  const scope = buildScope(parsedFiles.value.map((p) => p.parsed))
  const resources: NormalizedResource[] = []
  for (const { file, text, parsed } of parsedFiles.value) {
    const rel = toPosix(path.relative(projectRoot, file))
    resources.push(...normalize(parsed, rel, text, scope, environmentOverride))
  }

  // Follow local module calls, threading caller inputs into their vars.
  const followed = await followModules(
    parsedFiles.value,
    dir,
    projectRoot,
    scope,
    environmentOverride,
  )
  if (!followed.ok) return followed
  resources.push(...followed.value)

  return ok(resources)
}
