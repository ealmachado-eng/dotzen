import * as fs from 'fs'
import * as path from 'path'
import { TerraformRoot } from '../version/config'
import { Environment } from '../vocabulary'
import { composeSpec, ProfileName } from './profiles'

export interface ScaffoldFile {
  readonly path: string
  readonly content: string
}

function dotzenJson(
  version: string,
  terraform: TerraformRoot | TerraformRoot[],
): string {
  return (
    JSON.stringify({ version, spec: '.zen/spec.ts', terraform }, null, 2) + '\n'
  )
}

/** The files `dotzen init` writes (pure — no filesystem access). The spec.ts
 *  content is composed from the chosen `--profile` / `--presets` by
 *  `profiles.composeSpec` (single source of truth shared with `examples/`). */
export function scaffoldFiles(
  version: string,
  terraform: TerraformRoot | TerraformRoot[] = './terraform',
  specContent: string,
): ScaffoldFile[] {
  return [
    { path: 'dotzen.json', content: dotzenJson(version, terraform) },
    { path: path.join('.zen', 'spec.ts'), content: specContent },
  ]
}

const ignored = (rel: string): boolean =>
  rel
    .split(/[\\/]/)
    .some((p) => p.startsWith('.') || p === 'node_modules' || p === 'modules')

/**
 * Every directory (relative to `dir`) that contains `.tf` files *directly* —
 * i.e. every Terraform root module. `env/{dev,stg,prd}` yields three.
 */
export function tfRootDirs(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const entries = fs.readdirSync(dir, { recursive: true }) as string[]
  const roots = new Set<string>()
  for (const e of entries) {
    if (!e.endsWith('.tf') || ignored(e)) continue
    const rel = path.dirname(e)
    roots.add(rel === '.' ? '.' : './' + rel.split(/[\\/]/).join('/'))
  }
  return [...roots].sort()
}

// Guess a dotzen Environment from a root folder's leaf name (best-effort;
// the author edits/removes what doesn't fit). Folder names are arbitrary —
// only the mapped value must be a valid Environment.
const ENV_GUESS: Record<string, Environment> = {
  dev: Environment.Development,
  development: Environment.Development,
  sandbox: Environment.Development,
  stg: Environment.Staging,
  stage: Environment.Staging,
  staging: Environment.Staging,
  prd: Environment.Production,
  prod: Environment.Production,
  production: Environment.Production,
}

const withEnvGuess = (rootPath: string): TerraformRoot => {
  const leaf = (rootPath.split('/').pop() ?? '').toLowerCase()
  const environment = ENV_GUESS[leaf]
  return environment ? { path: rootPath, environment } : rootPath
}

/**
 * Detect where a project's existing Terraform lives, so init points
 * `dotzen.json` at the real path(s) instead of a fresh empty `terraform/`.
 * Returns a single path, or an array of roots (multiple, e.g.
 * per-environment) — mapping recognizable env folder names to an
 * `environment` so `.environment(X)` scoping works by folder. Returns
 * undefined for a greenfield project (no .tf yet).
 */
export function detectTerraform(
  dir: string,
): TerraformRoot | TerraformRoot[] | undefined {
  const roots = tfRootDirs(dir)
  if (roots.length === 0) return undefined
  if (roots.length === 1) return roots[0]
  return roots.map(withEnvGuess)
}

export interface InitOptions {
  terraform?: TerraformRoot | TerraformRoot[]
  /** `--profile startup|enterprise|regulated` (a curated bundle + bespoke rules). */
  profile?: ProfileName
  /** `--presets coreSecurity,cisAws,...` (extra presets, unioned + deduped). */
  presets?: readonly string[]
}

export interface InitResult {
  readonly created: string[]
  readonly skipped: string[]
  readonly terraform: TerraformRoot | TerraformRoot[]
  readonly detected: boolean
}

/**
 * Scaffold a new dotzen project into `dir`. Never overwrites an existing
 * file (fail-safe). Adapts `terraform` to an existing layout: an explicit
 * `opts.terraform` wins; otherwise it is auto-detected; a greenfield
 * project falls back to `./terraform` (and that dir is created). The
 * generated spec.ts is composed from `opts.profile` / `opts.presets`
 * (default: `[...coreSecurity]`).
 */
export function initProject(
  dir: string,
  version: string,
  opts: InitOptions = {},
): InitResult {
  const detected = opts.terraform ?? detectTerraform(dir)
  const terraform = detected ?? './terraform'
  const greenfield = detected === undefined

  const created: string[] = []
  const skipped: string[] = []

  const specContent = composeSpec({
    profile: opts.profile,
    presets: opts.presets,
  })
  for (const f of scaffoldFiles(version, terraform, specContent)) {
    const target = path.join(dir, f.path)
    if (fs.existsSync(target)) {
      skipped.push(f.path)
      continue
    }
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, f.content)
    created.push(f.path)
  }

  // Only scaffold an empty terraform/ dir for a greenfield project.
  if (greenfield) {
    const tf = path.join(dir, 'terraform')
    if (!fs.existsSync(tf)) {
      fs.mkdirSync(tf, { recursive: true })
      created.push('terraform/')
    }
  }

  return { created, skipped, terraform, detected: !greenfield }
}
