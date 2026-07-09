import * as path from 'path'
import { Result, ok } from '../result/result'
import { DotzenError } from '../result/errors'
import { readDotzenJson, enforceVersion } from '../version/config'
import { importSpecModule, loadSpec } from '../spec/load'
import { parseTf } from '../hcl/parse'
import { evaluate, CheckReport } from '../engine/evaluate'
import { NormalizedResource } from '../hcl/model'

/**
 * The pipeline (doc 06). Railway: every operational stage short-circuits
 * on error. `evaluate` is total, so it is the final `.map`-style step,
 * not a fallible stage. Written imperatively because stages are async.
 */
export async function check(
  projectRoot: string,
  engineVersion: string,
): Promise<Result<CheckReport, DotzenError>> {
  const loaded = readDotzenJson(projectRoot)
  if (!loaded.ok) return loaded

  const versioned = enforceVersion(loaded.value.config, engineVersion)
  if (!versioned.ok) return versioned

  const { baseDir } = loaded.value
  const { spec, terraform } = loaded.value.config

  const builders = await importSpecModule(path.resolve(baseDir, spec))
  if (!builders.ok) return builders

  const rules = loadSpec(builders.value)
  if (!rules.ok) return rules

  // Each root is a separate Terraform module: parse it independently so its
  // var/local scope stays isolated (no cross-root collisions). File paths
  // are reported relative to the project root, so findings show their root.
  // A root may declare an `environment`, which drives `.environment(X)`
  // rule scoping by folder instead of by tag.
  const roots = Array.isArray(terraform) ? terraform : [terraform]
  const resources: NormalizedResource[] = []
  for (const root of roots) {
    const rootPath = typeof root === 'string' ? root : root.path
    const env = typeof root === 'string' ? undefined : root.environment
    const parsed = await parseTf(path.resolve(baseDir, rootPath), baseDir, env)
    if (!parsed.ok) return parsed
    resources.push(...parsed.value)
  }

  return ok(evaluate(rules.value, resources))
}
