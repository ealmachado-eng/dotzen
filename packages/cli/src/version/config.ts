import * as fs from 'fs'
import * as path from 'path'
import { Result, ok, err } from '../result/result'
import { DotzenError } from '../result/errors'

/**
 * A Terraform root: a bare path, or a path with a declared `environment`
 * so `.environment(X)` rule scoping is folder-driven (not tag-dependent).
 */
export type TerraformRoot =
  string | { readonly path: string; readonly environment?: string }

export interface DotzenConfig {
  readonly version?: string
  readonly spec: string
  /** One Terraform root, or several (each evaluated with its own scope). */
  readonly terraform: TerraformRoot | TerraformRoot[]
}

/** Resolved config plus the directory it was found in (for relative paths). */
export interface LoadedConfig {
  readonly config: DotzenConfig
  readonly baseDir: string
}

const CANDIDATES = ['dotzen.json', path.join('.zen', 'dotzen.json')]

export function readDotzenJson(cwd: string): Result<LoadedConfig, DotzenError> {
  for (const rel of CANDIDATES) {
    const p = path.join(cwd, rel)
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as DotzenConfig
      return ok({ config: parsed, baseDir: path.dirname(p) })
    }
  }
  return err({ kind: 'ConfigNotFound', path: path.join(cwd, 'dotzen.json') })
}

/**
 * The first thing the CLI does. Refuse to run on a version mismatch
 * (doc 03 / engine-dev skill). No pin configured => proceed.
 */
export function enforceVersion<T extends { version?: string }>(
  config: T,
  running: string,
): Result<T, DotzenError> {
  if (!config.version) return ok(config)
  if (config.version === running) return ok(config)
  return err({
    kind: 'VersionMismatch',
    required: config.version,
    running,
  })
}
