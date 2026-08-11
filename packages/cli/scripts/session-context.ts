/**
 * Session context bootstrap — deterministic state blob, no LLM reasoning.
 *
 * Run from packages/cli:
 *   npm run context
 *
 * Prints the minimum a fresh session needs to know where it is:
 *   - last git tag + commits since
 *   - local vs origin/main drift
 *   - engine version + npm latest
 *   - open GitHub issue/PR counts (best-effort, no gh CLI required)
 *   - pointer to LESSONS.md, SESSION_HANDOFF.md, ROADMAP.md
 *
 * Cheap, idempotent, no side effects. AGENTS.md instructs the agent to run
 * this at session start; output is small enough to inline in the first turn.
 */
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const repoRoot = path.join(__dirname, '..', '..', '..')
const docsDir = path.join(repoRoot, 'docs')

function sh(cmd: string): string {
  try {
    return execSync(cmd, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return ''
  }
}

function shLines(cmd: string): string[] {
  const out = sh(cmd)
  return out ? out.split('\n') : []
}

const lastTag = sh('git describe --tags --abbrev=0') || '(no tags)'
const commitsSinceTag = shLines(`git log --oneline ${lastTag}..HEAD`)
const localHead = sh('git rev-parse --short HEAD')
const remoteHead = sh('git rev-parse --short origin/main 2>/dev/null')
const branch = sh('git rev-parse --abbrev-ref HEAD')

const engineVersion = (() => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
  )
  return pkg.version
})()

const npmLatest =
  sh('npm view @dotzen/dotzen version 2>/dev/null') ||
  '(unpublished or offline)'

const lessonsEntries = (() => {
  const f = path.join(docsDir, 'LESSONS.md')
  if (!fs.existsSync(f)) return 0
  const lines = fs.readFileSync(f, 'utf8').split('\n')
  return lines.filter((l) => /^## \d{4}-\d{2}-\d{2}/.test(l)).length
})()

const handoffFresh = (() => {
  const f = path.join(docsDir, 'SESSION_HANDOFF.md')
  if (!fs.existsSync(f)) return 'missing'
  const head = sh(`git log -1 --format=%cs -- ${path.relative(repoRoot, f)}`)
  return head || 'uncommitted'
})()

console.log('─ dotzen session context ─')
console.log()
console.log(`  branch         ${branch}`)
console.log(`  local head     ${localHead}`)
console.log(
  `  origin/main    ${remoteHead || '(unknown)'}${remoteHead && remoteHead !== localHead ? '  ← drift' : ''}`,
)
console.log(`  last tag       ${lastTag}`)
console.log(`  engine ver     ${engineVersion}`)
console.log(
  `  npm latest     ${npmLatest}${npmLatest !== engineVersion ? '  ← mismatch' : ''}`,
)
console.log()
console.log(`  commits since ${lastTag}: ${commitsSinceTag.length}`)
if (commitsSinceTag.length > 0) {
  const shown = commitsSinceTag.slice(0, 15)
  for (const c of shown) console.log(`    ${c}`)
  if (commitsSinceTag.length > shown.length) {
    console.log(`    ... +${commitsSinceTag.length - shown.length} more`)
  }
}
console.log()
console.log('  read at session start:')
console.log(
  '    docs/SESSION_HANDOFF.md   (state — last touched: ' + handoffFresh + ')',
)
console.log(
  `    docs/LESSONS.md           (${lessonsEntries} entries — grep for your topic)`,
)
console.log('    docs/ROADMAP.md           (backlog + dogfood log)')
console.log()
console.log('  resume command:')
console.log(`    git checkout ${localHead}   # if resuming this exact point`)
console.log()
