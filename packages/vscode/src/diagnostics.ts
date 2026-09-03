// Pure CheckReport → diagnostic-item mapping. No `vscode` import: the
// mapping is fully unit-testable outside the extension host; extension.ts
// adapts these items to vscode.Diagnostic at the boundary.
import { Effect, type CheckReport, type Violation } from '@erkos/pluvian'

export type Severity = 'error' | 'warning' | 'info' | 'hint'

export interface FindingItem {
  /** Physical file, project-root-relative, posix. */
  readonly file: string
  /** 1-based block-start line (the engine reports lines, not columns). */
  readonly line: number
  readonly severity: Severity
  readonly ruleId: string
  /** May be multi-line (message, rationale, approvers, graph detail). */
  readonly message: string
}

export interface MappedReport {
  readonly items: FindingItem[]
  /**
   * Messages for project-level findings (no file:line to attach a squiggle
   * to) — surfaced in the output channel, mirroring the SARIF convention.
   */
  readonly projectLevel: string[]
}

export interface VisibilityOptions {
  readonly showCouldNotEvaluate: boolean
  readonly showUngoverned: boolean
}

/** Synthetic file for project-level findings (requireResource conditions). */
export const PROJECT_FILE = '<project>'

/** Per-hop instantiation label appended by module following (SARIF §trace). */
const TRACE_LABEL = /\s*\([^)]*\)\s*$/

/**
 * The physical .tf file a finding should squiggle in. Findings inside
 * followed modules carry `<root> › <module file> (label[+key])` — the LAST
 * ` › ` hop is the file the resource lives in (same label convention the
 * SARIF renderer strips). NOTE: this is a different job from the CLI's
 * ignore-matching split (first segment) — don't unify them.
 */
export function physicalFile(f: string): string {
  const last = f.split(' › ').pop()!
  return last.replace(TRACE_LABEL, '')
}

/** The module-following trace (raw file string) when one is present. */
export function moduleTrace(f: string): string | undefined {
  return f.includes(' › ') ? f : undefined
}

function violationSeverity(effect: Effect): Severity {
  switch (effect) {
    case Effect.Block:
      return 'error'
    case Effect.Warn:
      return 'warning'
    case Effect.RequireApproval:
      return 'info'
  }
}

function violationMessage(v: Violation): string {
  const lines = [v.message]
  if (v.rationale) lines.push(`why: ${v.rationale}`)
  if (v.approvers) lines.push(`approvers: ${v.approvers.join(', ')}`)
  if (v.detail) lines.push(v.detail)
  return lines.join('\n')
}

export function mapReport(
  report: CheckReport,
  opts: VisibilityOptions,
): MappedReport {
  const items: FindingItem[] = []
  const projectLevel: string[] = []

  for (const v of report.violations) {
    const file = physicalFile(v.file)
    const message = violationMessage(v)
    if (file === PROJECT_FILE) {
      projectLevel.push(`${message} [${v.ruleId}]`)
      continue
    }
    const trace = moduleTrace(v.file)
    items.push({
      file,
      line: v.line,
      severity: violationSeverity(v.effect),
      ruleId: v.ruleId,
      message: trace ? `${message}\nmodule trace: ${trace}` : message,
    })
  }

  if (opts.showCouldNotEvaluate) {
    for (const u of report.couldNotEvaluate) {
      const file = physicalFile(u.file)
      const message = `${u.reason} (could not evaluate — rule ${u.ruleId})`
      if (file === PROJECT_FILE) {
        projectLevel.push(message)
        continue
      }
      items.push({
        file,
        line: u.line,
        severity: 'hint',
        ruleId: u.ruleId,
        message,
      })
    }
  }

  if (opts.showUngoverned) {
    for (const g of report.ungoverned) {
      items.push({
        file: physicalFile(g.file),
        line: g.line,
        severity: 'hint',
        ruleId: 'pluvian.ungoverned',
        message: `${g.type}.${g.name} is not in pluvian's vocabulary — no rule can govern it`,
      })
    }
  }

  return { items, projectLevel }
}
