import * as path from 'path'
import { Result, ok } from '../result/result'
import { DotzenError } from '../result/errors'
import { readDotzenJson, enforceVersion } from '../version/config'
import { importSpecModule, loadSpec } from '../spec/load'
import { parseTf, ModuleSkip, IgnoreDirective } from '../hcl/parse'
import { evaluate, CheckReport, Unevaluable } from '../engine/evaluate'
import {
  NormalizedResource,
  NormalizedOutput,
  NormalizedBinding,
  NormalizedTerraformSettings,
  NormalizedModuleCall,
} from '../hcl/model'

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
  const outputs: NormalizedOutput[] = []
  const bindings: NormalizedBinding[] = []
  const settings: NormalizedTerraformSettings[] = []
  const moduleCalls: NormalizedModuleCall[] = []
  const ignores: IgnoreDirective[] = []
  const skips: ModuleSkip[] = []
  for (const root of roots) {
    const rootPath = typeof root === 'string' ? root : root.path
    const env = typeof root === 'string' ? undefined : root.environment
    const parsed = await parseTf(path.resolve(baseDir, rootPath), baseDir, env)
    if (!parsed.ok) return parsed
    resources.push(...parsed.value.resources)
    outputs.push(...parsed.value.outputs)
    bindings.push(...parsed.value.bindings)
    settings.push(...parsed.value.settings)
    moduleCalls.push(...parsed.value.moduleCalls)
    ignores.push(...parsed.value.ignores)
    skips.push(...parsed.value.skips)
  }

  // Modules dotzen could NOT follow (remote/escape/missing, doc 08) surface
  // as could-not-evaluate so a gap is visible rather than a silent 0 checks.
  // A stable ruleId lets tooling filter them out of rule-driven entries.
  const moduleSkips: Unevaluable[] = skips.map((s) => ({
    ruleId: 'dotzen.module-following',
    resource: `module.${s.label}`,
    file: s.file,
    line: s.line,
    reason: `not followed: ${s.reason} (source=${s.source})`,
  }))

  const report = evaluate(
    rules.value,
    resources,
    outputs,
    bindings,
    settings,
    moduleCalls,
  )

  // Apply inline `dotzen:ignore` directives — suppress findings (violations +
  // could-not-evaluate) whose PHYSICAL file + block-start line match an
  // ignore. The physical file is the segment before any `›` trace so an ignore
  // in a module file suppresses findings from every instantiation of it.
  const ignored = new Set(ignores.map((d) => `${d.file}::${d.line}`))
  const physicalFile = (f: string) => f.split(' › ')[0]!
  const isIgnored = (file: string, line: number) =>
    ignored.has(`${physicalFile(file)}::${line}`)
  return ok({
    violations: report.violations.filter((v) => !isIgnored(v.file, v.line)),
    passed: report.passed,
    couldNotEvaluate: [...moduleSkips, ...report.couldNotEvaluate].filter(
      (u) => !isIgnored(u.file, u.line),
    ),
  })
}
