/**
 * Generate the `examples/{startup,enterprise,regulated}/.pluvian/spec.ts` templates
 * from the profiles module (`src/cli/profiles.ts`) — the single source of truth
 * shared with `pluvian init --profile`. Run after editing profiles:
 *   npm run gen-examples   (from packages/cli)
 * The generated files are covered by `src/spec/examples.test.ts` (loaded via
 * the real jiti spec loader), so a profile change that breaks load-validity
 * fails the suite.
 */
import * as fs from 'fs'
import * as path from 'path'
import { PROFILE_NAMES, PROFILES, composeSpec } from '../src/cli/profiles'

const repoRoot = path.join(__dirname, '..', '..', '..')
let changed = 0
for (const name of PROFILE_NAMES) {
  const content = composeSpec({
    profile: name,
    header: PROFILES[name].docblock,
  })
  const file = path.join(repoRoot, 'examples', name, '.pluvian', 'spec.ts')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  // Read directly and treat "missing" as empty — no existsSync-then-use
  // window (CodeQL js/file-system-race) and one syscall fewer.
  let prev = ''
  try {
    prev = fs.readFileSync(file, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  if (prev !== content) {
    fs.writeFileSync(file, content)
    changed++
    console.log(`  wrote examples/${name}/.pluvian/spec.ts`)
  } else {
    console.log(`  unchanged examples/${name}/.pluvian/spec.ts`)
  }
}
console.log(
  `Generated ${PROFILE_NAMES.length} example specs (${changed} changed).`,
)
