import * as fs from 'fs'
import * as path from 'path'
import { check } from './check'
import {
  renderTerminal,
  renderJson,
  renderSarif,
  renderError,
  reportExitCode,
  requiresApproval,
} from '../report/report'
import { CheckReport } from '../engine/evaluate'
import { initProject } from './scaffold'
import { CI_TEMPLATE_HINT } from '../templates/ci-templates'

/** The output format for `dotzen check`. `sarif` emits the SARIF 2.1.0
 *  interchange format for CI security dashboards (GitHub Code Scanning,
 *  GitLab security report artifacts, Azure DevOps, VS Code). */
type Format = 'terminal' | 'json' | 'sarif'

/**
 * Emit the approval signal for CI (doc 04), so a later manual-approval job
 * can gate on DOTZEN_REQUIRES_APPROVAL. CI-agnostic:
 *  - GitLab CI (and any CI): write a dotenv file the pipeline exposes via
 *    `artifacts:reports:dotenv` (path overridable with DOTZEN_ENV_FILE,
 *    default `dotzen.env`).
 *  - GitHub Actions: also append to $GITHUB_ENV if present.
 * No-op outside CI, so local runs never leave a stray file.
 */
function emitApprovalSignal(report: CheckReport): void {
  const line = `DOTZEN_REQUIRES_APPROVAL=${requiresApproval(report)}\n`
  const ghEnv = process.env.GITHUB_ENV
  if (ghEnv) fs.appendFileSync(ghEnv, line)
  if (process.env.GITLAB_CI || process.env.CI) {
    fs.writeFileSync(process.env.DOTZEN_ENV_FILE ?? 'dotzen.env', line)
  }
}

function engineInfo(): { version: string; informationUri: string } {
  const pkg = path.join(__dirname, '..', '..', 'package.json')
  const j = JSON.parse(fs.readFileSync(pkg, 'utf8')) as {
    version: string
    homepage?: string
  }
  return {
    version: j.version,
    // homepage points at the canonical docs/repo page (package.json homepage).
    informationUri: j.homepage ?? 'https://gitlab.com/governance-tools/dotzen',
  }
}

function parseArgs(argv: string[]): {
  command?: string
  root: string
  format: Format
  terraform?: string
} {
  const [command, ...rest] = argv
  let root = '.'
  let format: Format = 'terminal'
  let terraform: string | undefined
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (a === '--format') {
      const v = rest[i + 1]
      format = v === 'json' ? 'json' : v === 'sarif' ? 'sarif' : 'terminal'
      i++
    } else if (a === '--format=json') {
      format = 'json'
    } else if (a === '--format=sarif') {
      format = 'sarif'
    } else if (a === '--terraform') {
      terraform = rest[i + 1]
      i++
    } else if (a?.startsWith('--terraform=')) {
      terraform = a.slice('--terraform='.length)
    } else if (a && !a.startsWith('--')) {
      root = a
    }
  }
  return { command, root, format, terraform }
}

function runInit(dir: string, terraform?: string): number {
  const res = initProject(dir, engineInfo().version, { terraform })
  for (const c of res.created) process.stdout.write(`  created  ${c}\n`)
  for (const s of res.skipped)
    process.stdout.write(`  skipped  ${s} (already exists)\n`)

  process.stdout.write(
    '\nFor editor autocomplete + type-checking of .zen/spec.ts, install the\n' +
      'types locally:  npm i -D @dotzen/dotzen   (and add node_modules/ to\n' +
      '.gitignore). Running `check` via npx needs no local install.\n',
  )

  if (res.detected) {
    const roots = Array.isArray(res.terraform) ? res.terraform : [res.terraform]
    const fmt = (r: (typeof roots)[number]) =>
      typeof r === 'string' ? `"${r}"` : `"${r.path}" (${r.environment})`
    const label =
      roots.length > 1
        ? `${roots.length} Terraform roots: ${roots.map(fmt).join(', ')}`
        : `existing Terraform at ${fmt(roots[0]!)}`
    process.stdout.write(
      `\nUsing ${label} (from dotzen.json).\n` +
        `If that's not right, edit "terraform" in dotzen.json (or re-run with --terraform <path>).\n` +
        `Then run: npx @dotzen/dotzen check\n`,
    )
  } else {
    process.stdout.write(
      '\nNext: add .tf files under terraform/, then run: npx @dotzen/dotzen check\n',
    )
  }
  process.stdout.write(CI_TEMPLATE_HINT)
  return 0
}

export async function run(argv: string[]): Promise<number> {
  const { command, root, format, terraform } = parseArgs(argv)

  if (command === 'init') return runInit(root, terraform)

  if (command !== 'check') {
    process.stderr.write(
      'usage: dotzen <check|init> [projectRoot] [--format json|sarif]\n',
    )
    return 2
  }

  const info = engineInfo()
  const result = await check(root, info.version)
  if (!result.ok) {
    process.stderr.write(renderError(result.error) + '\n')
    return 2
  }

  // SARIF + JSON are machine output — never color, no approval-signal file
  // (those are for human terminal runs; a CI sarif upload reads stdout).
  if (format === 'sarif') {
    process.stdout.write(renderSarif(result.value, info) + '\n')
    return reportExitCode(result.value)
  }
  if (format === 'json') {
    process.stdout.write(renderJson(result.value) + '\n')
    emitApprovalSignal(result.value)
    return reportExitCode(result.value)
  }
  // Color only a real terminal; honor NO_COLOR.
  const color = process.stdout.isTTY === true && !process.env.NO_COLOR
  process.stdout.write(renderTerminal(result.value, { color }) + '\n')
  emitApprovalSignal(result.value)
  return reportExitCode(result.value)
}

run(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(`✗ unexpected error: ${String(e)}\n`)
    process.exit(2)
  })
