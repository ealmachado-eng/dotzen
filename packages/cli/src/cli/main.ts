import * as fs from 'fs'
import * as path from 'path'
import { check } from './check'
import {
  renderTerminal,
  renderJson,
  renderError,
  reportExitCode,
  requiresApproval,
} from '../report/report'
import { CheckReport } from '../engine/evaluate'
import { initProject } from './scaffold'

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
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- CI-controlled dotenv path
    fs.writeFileSync(process.env.DOTZEN_ENV_FILE ?? 'dotzen.env', line)
  }
}

function engineVersion(): string {
  const pkg = path.join(__dirname, '..', '..', 'package.json')
  return (JSON.parse(fs.readFileSync(pkg, 'utf8')) as { version: string })
    .version
}

function parseArgs(argv: string[]): {
  command?: string
  root: string
  json: boolean
  terraform?: string
} {
  const [command, ...rest] = argv
  let root = '.'
  let json = false
  let terraform: string | undefined
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (a === '--format') {
      json = rest[i + 1] === 'json'
      i++
    } else if (a === '--format=json') {
      json = true
    } else if (a === '--terraform') {
      terraform = rest[i + 1]
      i++
    } else if (a?.startsWith('--terraform=')) {
      terraform = a.slice('--terraform='.length)
    } else if (a && !a.startsWith('--')) {
      root = a
    }
  }
  return { command, root, json, terraform }
}

function runInit(dir: string, terraform?: string): number {
  const res = initProject(dir, engineVersion(), { terraform })
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
  return 0
}

export async function run(argv: string[]): Promise<number> {
  const { command, root, json, terraform } = parseArgs(argv)

  if (command === 'init') return runInit(root, terraform)

  if (command !== 'check') {
    process.stderr.write(
      'usage: dotzen <check|init> [projectRoot] [--format json]\n',
    )
    return 2
  }

  const result = await check(root, engineVersion())
  if (!result.ok) {
    process.stderr.write(renderError(result.error) + '\n')
    return 2
  }

  // Color only a real terminal; honor NO_COLOR. Never color JSON or logs.
  const color = process.stdout.isTTY === true && !process.env.NO_COLOR
  const output = json
    ? renderJson(result.value)
    : renderTerminal(result.value, { color })
  process.stdout.write(output + '\n')
  emitApprovalSignal(result.value)
  return reportExitCode(result.value)
}

run(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(`✗ unexpected error: ${String(e)}\n`)
    process.exit(2)
  })
