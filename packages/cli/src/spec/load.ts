import * as fs from 'fs'
import { createJiti } from 'jiti'
import { Result, ok, err, combineWithAllErrors } from '../result/result'
import { DotzenError } from '../result/errors'
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
    const jiti = createJiti(__filename)
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
  if (validated.ok) return ok(validated.value)
  return err({ kind: 'SpecInvalid', errors: validated.error.flat() })
}
