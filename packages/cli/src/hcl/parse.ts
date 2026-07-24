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

const escapeRegExp = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

interface ParsedFile {
  file: string
  text: string
  parsed: Hcl2JsonRoot
}

/**
 * A `module {}` call dotzen did NOT follow (doc 08 DoD: never silently pass).
 * Surfaced as `couldNotEvaluate` (ruleId `dotzen.module-following`) by the
 * CLI so the user knows a gap exists — remote sources, escapes, missing dirs.
 */
export interface ModuleSkip {
  /** Module block label — the `"x"` in `module "x" {}`. */
  readonly label: string
  /** Raw `source` value, for the reason string. */
  readonly source: string
  /** Caller file path relative to projectRoot. */
  readonly file: string
  /** 1-based line of the `module "x"` block in the caller file. */
  readonly line: number
  /** Why it was not followed. */
  readonly reason: string
}

/** `parseTf` success payload: followed resources + skipped module calls. */
export interface ParseOutput {
  readonly resources: NormalizedResource[]
  readonly skips: ModuleSkip[]
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

/** 1-based line of `module "<label>" {` in the caller file (best-effort). */
function findModuleLine(text: string, label: string): number {
  const lines = text.split(/\r?\n/)
  // eslint-disable-next-line security/detect-non-literal-regexp -- label escaped
  const needle = new RegExp(`module\\s+"${escapeRegExp(label)}"`)
  for (let i = 0; i < lines.length; i++) {
    if (needle.test(lines[i] ?? '')) return i + 1
  }
  return 1
}

/**
 * Resolve a `module` block's `count` against the caller scope to a number.
 * A literal 0 (or a var that resolves to it) → the module is disabled and
 * has no resources to evaluate; dotzen skips it silently (no skip note — it
 * is correct, not a gap). Any compound expression (`var.x ? 0 : 1`) does not
 * resolve → return undefined → do not skip (follow once, honest).
 */
const countIsZero = (count: unknown, scope: Scope): boolean => {
  const resolved = typeof count === 'string' ? resolveRaw(count, scope) : count
  return resolved === 0
}

/** A single `for_each` element to expand a module block over. */
interface ForEachElement {
  /** Stringified element key — list index, set element, or map key. */
  readonly key: string
  /** Raw element value (threaded into the module scope as `each.value`). */
  readonly value: unknown
}

/**
 * Resolve a `module` block's `for_each` to the per-element expansion.
 * Returns:
 *  - `null`  → no `for_each`: one iteration, no `each.*` bindings.
 *  - `[]`    → `for_each = toset([])` / empty literal — no instances (silent).
 *  - `[{…}]` → one entry per element; `each.value` / `each.key` get threaded.
 *  - `[{key: '?'}]` (single, key '?') → unresolvable; follow once honestly
 *    without `each.*` (the engine degrades dependent checks to
 *    could-not-evaluate). Distinguishable from a real one-element set by the
 *    synthetic key '?' used only on the unresolvable path.
 */
function expandForEach(
  forEach: unknown,
  scope: Scope,
): ForEachElement[] | null {
  if (forEach === undefined) return null
  // Literal object map — hcl2json yields a plain object.
  if (forEach && typeof forEach === 'object' && !Array.isArray(forEach)) {
    return Object.entries(forEach as Record<string, unknown>).map(
      ([key, value]) => ({ key, value }),
    )
  }
  // Literal array / a var-resolved list — treated like `toset(...)`:
  // each.key = each.value = the element (Terraform's for_each-over-set rule).
  if (Array.isArray(forEach)) {
    return forEach.map((value) => ({ key: String(value), value }))
  }
  // Reference: `${var.x}` / `${local.x}` → resolveRaw to a literal collection.
  if (typeof forEach === 'string') {
    const resolved = resolveRaw(forEach, scope)
    if (Array.isArray(resolved)) {
      return resolved.map((value) => ({ key: String(value), value }))
    }
    if (resolved && typeof resolved === 'object') {
      return Object.entries(resolved as Record<string, unknown>).map(
        ([key, value]) => ({ key, value }),
      )
    }
    // Unresolvable (no default, or a `toset(...)`/function-call compound) →
    // follow once honestly, no `each.*` bindings.
    return [{ key: '?', value: undefined }]
  }
  return [{ key: '?', value: undefined }]
}

/**
 * Module-following (doc 08). For each local `module { source, <inputs> }`
 * call in the caller's files, parse the module dir and normalize its
 * resources with a scope = the module's own defaults/locals overlaid with
 * the caller's inputs (resolved in the caller's scope) as `var.*`. This is
 * what turns caller-`var` values (cidrs, tags) into concrete verdicts.
 *
 * Local sources only. `count = 0` skips the module silently (no resources).
 * `for_each` (resolvable literal map/var-list) expands per element, with
 * `each.value` / `each.key` threaded into the module scope; an unresolvable
 * `for_each` is followed once (honest; each.* degrades to could-not-evaluate).
 * Non-local sources, escapes, missing dirs, and cycles are recorded as
 * `ModuleSkip` notes per doc 08's DoD (never a silent pass) — the CLI
 * surfaces them as could-not-evaluate.
 *
 * Recursive (doc 08 tranche 5): a followed module's own `module {}` calls
 * are followed too, bounded by a path-stack of resolved module dirs (a cycle
 * yields a skip, not infinite recursion). Per-instantiation isolation is
 * preserved at every level: each call gets its own scope + trace label.
 */
async function followModules(
  callerFiles: ParsedFile[],
  /**
   * Trace prefix accumulated from the chain of enclosing module calls. Each
   * followed call appends `› <module-file> (<label>[<key>])`, so findings on
   * a nested module name every hop — full chain visibility.
   */
  traceRoot: string,
  projectRoot: string,
  callerScope: Scope,
  environmentOverride: string | undefined,
  /** Resolved absolute dirs on the current follow-path (cycle bound). */
  pathStack: Set<string> = new Set(),
): Promise<Result<ParseOutput, DotzenError>> {
  const out: NormalizedResource[] = []
  const skips: ModuleSkip[] = []

  for (const { file, text, parsed } of callerFiles) {
    const fileRel = toPosix(path.relative(projectRoot, file))
    for (const [label, calls] of Object.entries(parsed.module ?? {})) {
      for (const raw of Array.isArray(calls) ? calls : []) {
        const block = (raw ?? {}) as Record<string, unknown>
        const source = block.source
        const line = findModuleLine(text, label)
        const note = (reason: string): ModuleSkip => ({
          label,
          source: typeof source === 'string' ? source : String(source ?? '?'),
          file: fileRel,
          line,
          reason,
        })

        // count = 0 (literal, or a var resolving to it) disables the module
        // — there are no resources to evaluate; skip silently (not a gap).
        if (block.count !== undefined && countIsZero(block.count, callerScope))
          continue

        // v1: local relative paths only. Registry/git/archive → record + skip.
        if (!isLocalSource(source)) {
          skips.push(note('remote or non-local source'))
          continue
        }

        const moduleDir = path.resolve(path.dirname(file), source as string)
        // Confine to the scanned project; never escape it.
        if (path.relative(projectRoot, moduleDir).startsWith('..')) {
          skips.push(note('source resolves outside the scanned project'))
          continue
        }
        // Cycle guard: never re-enter a dir already on the current path.
        if (pathStack.has(moduleDir)) {
          skips.push(note('module cycle detected'))
          continue
        }
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- moduleDir confined to projectRoot above
        if (!fs.existsSync(moduleDir)) {
          skips.push(note('module path not found'))
          continue
        }

        const parsedModule = await parseDir(moduleDir)
        if (!parsedModule.ok) return parsedModule

        // Expand for_each (or fall back to a single iteration).
        const elements = expandForEach(block.for_each, callerScope) ?? [
          { key: '', value: undefined },
        ]
        // An empty resolved collection (e.g. `for_each = toset([])`) →
        // no instances: skip silently (correct, like count=0).
        if (elements.length === 0) continue

        for (const el of elements) {
          // Module scope: its own defaults/locals, then caller inputs win.
          const moduleScope = buildScope(
            parsedModule.value.map((f) => f.parsed),
          )
          for (const [name, value] of Object.entries(block)) {
            if (MODULE_META.has(name)) continue
            const resolved = resolveRaw(value, callerScope)
            moduleScope.set(
              `var.${name}`,
              resolved !== undefined ? resolved : value,
            )
          }
          // Thread each.* into the module scope when expanded from for_each.
          if (el.key !== '') {
            moduleScope.set('each.value', el.value)
            moduleScope.set('each.key', el.key)
          }
          // Per-instance trace. for_each expansions append `[key]`; the
          // synthetic '?' marks an unresolvable for_each (one iteration, no
          // each bindings) and is omitted from the label.
          const keyTag = el.key && el.key !== '?' ? `[${el.key}]` : ''
          // Trace prefix handed to nested recursion — accumulates the full
          // call chain so a finding on a deep module names every hop.
          let childTraceRoot = ''
          for (const m of parsedModule.value) {
            const modRel = toPosix(path.relative(projectRoot, m.file))
            const base = traceRoot ? `${traceRoot} › ${modRel}` : modRel
            const trace = `${base} (${label}${keyTag})`
            out.push(
              ...normalize(
                m.parsed,
                trace,
                m.text,
                moduleScope,
                environmentOverride,
              ),
            )
            if (!childTraceRoot) childTraceRoot = base
          }
          // When the module has NO direct files (edge case), fall back to
          // traceRoot + the label so nested traces still chain.
          if (!childTraceRoot) {
            const modRel = toPosix(path.relative(projectRoot, moduleDir))
            childTraceRoot = traceRoot ? `${traceRoot} › ${modRel}` : modRel
          }
          // Stash the current instance's label onto childTraceRoot so nested
          // resources chain the parent instantiation explicitly.
          childTraceRoot = `${childTraceRoot} (${label}${keyTag})`

          // Recurse: the module's own `module {}` calls (nested modules).
          const nested = await followModules(
            parsedModule.value,
            childTraceRoot,
            projectRoot,
            moduleScope,
            environmentOverride,
            new Set([...pathStack, moduleDir]),
          )
          if (!nested.ok) return nested
          out.push(...nested.value.resources)
          skips.push(...nested.value.skips)
        }
      }
    }
  }
  return ok({ resources: out, skips })
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
 * caller's inputs threaded in as `var.*`. Non-followed modules (remote
 * source, project escape, missing dir) are returned as `skips` so the CLI
 * can surface them as could-not-evaluate (doc 08 DoD — never a silent pass).
 */
export async function parseTf(
  dir: string,
  projectRoot: string = dir,
  environmentOverride?: string,
): Promise<Result<ParseOutput, DotzenError>> {
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
  const rootRel = toPosix(path.relative(projectRoot, dir))
  const followed = await followModules(
    parsedFiles.value,
    rootRel,
    projectRoot,
    scope,
    environmentOverride,
  )
  if (!followed.ok) return followed
  resources.push(...followed.value.resources)

  return ok({ resources, skips: followed.value.skips })
}
