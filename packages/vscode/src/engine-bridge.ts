// Bridge to the bundled engine. Pure Node (no `vscode` import) — testable
// outside the extension host, including a real in-process `check()` run.
import { createRequire } from 'module'
import {
  check,
  readEngineConfig,
  type CheckReport,
  type EngineError,
} from '@erkos/pluvian'

const requireFromHere = createRequire(__filename)

/**
 * Version of the engine bundled with this extension. Lockstep with the
 * extension's own version (guarded by version-lockstep.test.ts).
 */
export const bundledEngineVersion: string = requireFromHere(
  '@erkos/pluvian/package.json',
).version

export interface CheckRun {
  readonly ok: true
  readonly report: CheckReport
  /** The `version` pin declared in pluvian.json, if any. */
  readonly pinnedVersion: string | undefined
  readonly engineVersion: string
}

export interface CheckFailure {
  readonly ok: false
  readonly error: EngineError
  readonly engineVersion: string
}

export type CheckOutcome = CheckRun | CheckFailure

/**
 * Run the exact check the CLI runs, in-process. A version-pin mismatch
 * never refuses (the editor's policy: notify and run — spec 11); the
 * caller compares `pinnedVersion` with `engineVersion` to surface it.
 */
export async function runCheck(projectRoot: string): Promise<CheckOutcome> {
  const cfg = readEngineConfig(projectRoot)
  const pinnedVersion = cfg.ok ? cfg.value.config.version : undefined
  const r = await check(projectRoot, bundledEngineVersion, {
    enforcePin: false,
  })
  return r.ok
    ? {
        ok: true,
        report: r.value,
        pinnedVersion,
        engineVersion: bundledEngineVersion,
      }
    : { ok: false, error: r.error, engineVersion: bundledEngineVersion }
}

export interface PinMismatch {
  readonly pinned: string
  readonly running: string
}

/**
 * Any difference between pin and bundled engine is a mismatch worth
 * surfacing — the engine's own gate is exact-equality, so even a
 * semver-compatible pin gets a nudge to align.
 */
export function pinMismatch(
  pinned: string | undefined,
  running: string,
): PinMismatch | undefined {
  return pinned !== undefined && pinned !== running
    ? { pinned, running }
    : undefined
}
