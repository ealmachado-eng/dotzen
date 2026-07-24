import * as fs from 'fs'
import * as path from 'path'
import { createJiti } from 'jiti'
import { Result, ok, err, combineWithAllErrors } from '../result/result'
import { DotzenError, RuleValidationError } from '../result/errors'
import { RuleBuilder, Rule } from './rule'

/**
 * Load `.zen/spec.ts` via a pure-JS runtime TypeScript loader (jiti) —
 * decided in doc 06 §"Spec loading". This is the isolated seam; swapping
 * the loader touches only this function.
 */
export async function importSpecModule(
  specPath: string,
): Promise<Result<RuleBuilder[], DotzenError>> {
  if (!fs.existsSync(specPath))
    return err({ kind: 'ConfigNotFound', path: specPath })

  try {
    // A scaffolded spec imports `@dotzen/dotzen`, but under `npx` the engine
    // runs from the npx cache while the user's project has no local install —
    // so that bare specifier won't resolve from the spec's location. Alias it
    // to THIS running engine's own barrel (dist/index.js at runtime, or
    // src/index.ts under the test transpiler — extension-less so jiti picks
    // the right one). This is what makes the zero-install `npx` flow work.
    const enginePath = path.join(__dirname, '..', 'index')
    const jiti = createJiti(__filename, {
      alias: { '@dotzen/dotzen': enginePath },
    })
    const mod = (await jiti.import(specPath)) as { spec?: unknown }
    const spec = mod.spec
    if (!Array.isArray(spec))
      return err({
        kind: 'SpecLoadFailed',
        path: specPath,
        detail: 'spec.ts must export a `spec` array of rules',
      })
    return ok(spec as RuleBuilder[])
  } catch (e) {
    return err({
      kind: 'SpecLoadFailed',
      path: specPath,
      detail: e instanceof Error ? e.message : String(e),
    })
  }
}

/**
 * Validate all rules, ACCUMULATING every problem (doc 06, Rule 3) rather
 * than failing on the first invalid rule.
 */
export function loadSpec(builders: RuleBuilder[]): Result<Rule[], DotzenError> {
  const validated = combineWithAllErrors(builders.map((b, i) => b.validate(i)))
  if (!validated.ok)
    return err({ kind: 'SpecInvalid', errors: validated.error.flat() })

  // Check for duplicate author-chosen rule IDs (positional rule-N IDs are
  // inherently unique; only stable .id() values can collide).
  const seen = new Map<string, number>() // id → first index
  const dupErrors: RuleValidationError[] = []
  for (const [i, rule] of validated.value.entries()) {
    // Skip positional auto-generated IDs (rule-1, rule-2, ...).
    if (/^rule-\d+$/.test(rule.id)) continue
    const prev = seen.get(rule.id)
    if (prev !== undefined) {
      dupErrors.push({
        ruleIndex: i,
        problem: `duplicate rule ID "${rule.id}" (also used by rule ${prev + 1})`,
      })
    } else {
      seen.set(rule.id, i)
    }
  }
  if (dupErrors.length > 0)
    return err({ kind: 'SpecInvalid', errors: dupErrors })

  return ok(validated.value)
}
