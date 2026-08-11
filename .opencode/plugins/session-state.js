// opencode plugin — remind the agent to bootstrap session context on the
// first bash tool call of each session.
//
// The graphify plugin (./graphify.js) already does this for graphify-out/.
// This twin injects a one-shot reminder pointing at:
//   - npm run context  (deterministic state blob)
//   - docs/SESSION_HANDOFF.md  (rolling state log)
//   - docs/LESSONS.md  (two-sided KEEP/AVOID — grep before acting)
//
// The reminder is prepended once per session, exactly like graphify.
// IMPORTANT: keep the reminder string free of backticks and $(...) —
// see graphify.js for the rationale (the hook prepends via echo).
import { existsSync, join } from 'fs'

export const SessionStatePlugin = async ({ directory }) => {
  let reminded = false

  return {
    'tool.execute.before': async (input, output) => {
      if (reminded) return
      if (input.tool !== 'bash') return
      // Only fire in this project — check for a marker file.
      if (!existsSync(join(directory, 'docs', 'LESSONS.md'))) return

      output.args.command =
        'echo "[memory] run \`npm run context\` from packages/cli/ for state blob. Read docs/SESSION_HANDOFF.md (rolling state) + grep docs/LESSONS.md for your topic (KEEP/AVOID two-sided) before substantive work. docs/DECISIONS.md is the one-liner choice log." ; ' +
        output.args.command
      reminded = true
    },
  }
}
