import { CheckReport, Violation } from '../engine/evaluate'
import { DotzenError } from '../result/errors'
import { Effect } from '../vocabulary'

const assertNever = (x: never): never => {
  throw new Error(`unhandled: ${JSON.stringify(x)}`)
}

const byEffect = (r: CheckReport, e: Effect): Violation[] =>
  r.violations.filter((v) => v.effect === e)

// Tiny ANSI helper — no dependency (stay pure-JS, minimal deps).
const ANSI = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
}

type Painter = (text: string, ...codes: string[]) => string
const makePaint =
  (color: boolean): Painter =>
  (text, ...codes) =>
    color ? codes.join('') + text + ANSI.reset : text

/** A blocking violation fired (only Block fails the build). */
export const hasBlocking = (r: CheckReport): boolean =>
  r.violations.some((v) => v.effect === Effect.Block)

/** A require_approval rule fired — the pipeline must pause for sign-off. */
export const requiresApproval = (r: CheckReport): boolean =>
  r.violations.some((v) => v.effect === Effect.RequireApproval)

/**
 * Only BLOCK violations fail the build (exit 1). Warnings and
 * require_approval do not hard-fail — the pipeline proceeds (to a manual
 * approval gate when approval is required). See doc 04.
 */
export function reportExitCode(report: CheckReport): 0 | 1 {
  return hasBlocking(report) ? 1 : 0
}

export function renderTerminal(
  report: CheckReport,
  opts: { color?: boolean } = {},
): string {
  const paint = makePaint(opts.color ?? false)
  const lines: string[] = []
  const cne = report.couldNotEvaluate.length

  const section = (
    title: string,
    marker: string,
    tone: string,
    vs: Violation[],
  ) => {
    if (vs.length === 0) return
    lines.push(paint(`── ${title.toUpperCase()} ──`, tone, ANSI.bold))
    for (const v of vs) {
      lines.push(`${paint(marker, tone)} ${v.resource}  (${v.file}:${v.line})`)
      lines.push(`    ${v.message}`)
      if (v.rationale) lines.push(`    ↳ ${v.rationale}`)
      if (v.approvers?.length)
        lines.push(`    approvers: ${v.approvers.join(', ')}`)
    }
  }

  // Most severe first.
  section('blocking', '✗', ANSI.red, byEffect(report, Effect.Block))
  section(
    'approval required',
    '⏸',
    ANSI.yellow,
    byEffect(report, Effect.RequireApproval),
  )
  section('warnings', '‼', ANSI.yellow, byEffect(report, Effect.Warn))

  if (report.couldNotEvaluate.length > 0) {
    lines.push(paint('── COULD NOT EVALUATE ──', ANSI.magenta, ANSI.bold))
    for (const u of report.couldNotEvaluate) {
      lines.push(
        `${paint('?', ANSI.magenta)} ${u.resource}  (${u.file}:${u.line}): ${u.reason} (${u.ruleId})`,
      )
    }
  }

  lines.push('')
  if (report.violations.length === 0) {
    if (cne === 0) {
      // Reserve the unqualified green check for a truly complete pass.
      lines.push(`${paint('✓ passed', ANSI.green)} (${report.passed} checks)`)
    } else {
      // No violations, but some checks couldn't be evaluated — those are
      // gaps to review, not successes, so don't show a clean green ✓.
      lines.push(
        `${paint('⚠ no violations', ANSI.magenta)}, but ${paint(
          `${cne} could not be evaluated`,
          ANSI.magenta,
        )} — review the section above (${report.passed} passed)`,
      )
    }
  } else {
    const count = `${report.violations.length} violation(s)`
    const vmark = hasBlocking(report)
      ? paint(`✗ ${count}`, ANSI.red)
      : paint(`⚠ ${count}`, ANSI.yellow)
    lines.push(
      `${vmark}, ${paint(`${report.passed} passed`, ANSI.green)}, ${paint(`${cne} could not be evaluated`, ANSI.magenta)}`,
    )
    if (requiresApproval(report))
      lines.push(
        paint(
          '⏸ approval required before apply (DOTZEN_REQUIRES_APPROVAL)',
          ANSI.yellow,
        ),
      )
  }
  return lines.join('\n')
}

/**
 * The JSON output schema version. Frozen for 1.0 — external tooling (CI
 * dashboards, PR annotators) can depend on this shape. Bumped only on a
 * breaking change to the JSON contract (a removed/renamed field); additive
 * fields (a new violation attribute) do NOT bump it (consumers must ignore
 * unknown fields per robust JSON handling). See doc 09.
 */
export const JSON_SCHEMA_VERSION = 1

export function renderJson(report: CheckReport): string {
  return JSON.stringify(
    {
      schemaVersion: JSON_SCHEMA_VERSION,
      ...report,
      requiresApproval: requiresApproval(report),
    },
    null,
    2,
  )
}

/** Exhaustive over DotzenError.kind (doc 06). */
export function renderError(error: DotzenError): string {
  switch (error.kind) {
    case 'ConfigNotFound':
      return `✗ dotzen config not found: ${error.path}`
    case 'VersionMismatch':
      return [
        `✗ dotzen version mismatch`,
        `  required: ${error.required} (from dotzen.json)`,
        `  running:  ${error.running}`,
        ``,
        `  run: npx @dotzen/dotzen@${error.required} check`,
      ].join('\n')
    case 'SpecLoadFailed':
      return `✗ could not load spec ${error.path}: ${error.detail}`
    case 'SpecInvalid':
      return [
        `✗ spec has invalid rules:`,
        ...error.errors.map((e) => `  rule ${e.ruleIndex + 1}: ${e.problem}`),
      ].join('\n')
    case 'PathNotFound':
      return `✗ terraform path not found: ${error.path}`
    case 'ParseFailed':
      return `✗ failed to parse ${error.file}: ${error.detail}`
    default:
      return assertNever(error)
  }
}
