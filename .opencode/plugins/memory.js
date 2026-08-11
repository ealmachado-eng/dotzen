// opencode plugin — preserve session memory across compaction.
//
// Fires on `experimental.session.compacting` (before the LLM generates a
// continuation summary). Injects the rolling memory files so the compressed
// context still knows: current state (handoff), open lessons (KEEP/AVOID),
// recent decisions, and the auto-generated session state blob.
//
// Without this, a compaction event drops everything except what the LLM
// happened to summarize — and the agent loses the harness mid-session.
// With this, every compaction re-anchors the agent to the same source of
// truth a fresh session would read.
import { existsSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

const MAX_BYTES = 12000 // cap each file at ~12KB so compaction stays bounded

function readCapped(p: string): string | null {
  if (!existsSync(p)) return null
  try {
    const stats = statSync(p)
    const head = readFileSync(p, { encoding: 'utf8', flag: 'r' })
    const bytes = Buffer.byteLength(head, 'utf8')
    const note = bytes > MAX_BYTES ? ` (_truncated from ${bytes}B — see full file_)` : ''
    return `<!-- ${p} (mtime ${stats.mtimeIso || stats.mtime.toISOString()})${note} -->\n${head.slice(0, MAX_BYTES)}`
  } catch {
    return null
  }
}

export const MemoryPlugin = async ({ directory }) => {
  return {
    'experimental.session.compacting': async (input, output) => {
      const root = directory || process.cwd()
      const context = output.context || (output.context = [])

      const files = [
        join(root, '.session', 'state.md'),
        join(root, 'docs', 'SESSION_HANDOFF.md'),
        join(root, 'docs', 'LESSONS.md'),
        join(root, 'docs', 'DECISIONS.md'),
      ]

      context.push(
        `## Persistent memory (auto-injected at compaction)\n\nThe following files are the rolling memory for this project. Re-read the relevant one before acting; do not assume prior turns have summarized them accurately.\n`,
      )

      for (const f of files) {
        const rel = f.replace(root + '/', '')
        const content = readCapped(f)
        if (content) {
          context.push(`### ${rel}\n\n${content}\n`)
        } else {
          context.push(`### ${rel}\n\n_(file not present — skipped)_\n`)
        }
      }

      // Always remind the agent where to find fresh state.
      context.push(
        `\n## Memory hygiene\n\n- After non-trivial work, append to \`docs/LESSONS.md\` (KEEP/AVOID) and \`docs/DECISIONS.md\` (one-liner).\n- After release or session close, append a new \`## Session N — YYYY-MM-DD\` section to \`docs/SESSION_HANDOFF.md\`.\n- Run \`npm run context\` from \`packages/cli/\` for a deterministic state blob.\n`,
      )
    },
  }
}
