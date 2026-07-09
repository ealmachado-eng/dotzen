import * as fs from 'fs'
import * as path from 'path'
import { parse as hcl2json } from '@cdktf/hcl2json'
import { Result, ok, err } from '../result/result'
import { DotzenError } from '../result/errors'
import { NormalizedResource } from './model'
import { normalize, buildScope, Hcl2JsonRoot } from './normalize'

function findTfFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { recursive: true }) as string[]
  return entries.filter((e) => e.endsWith('.tf')).map((e) => path.join(dir, e))
}

const toPosix = (p: string): string => p.split(path.sep).join('/')

/**
 * Read a terraform directory, parse each .tf via the official parser
 * (hcl2json / WASM), and normalize into dotzen's model. Async because
 * the WASM parser is async. Reported file paths are made relative to
 * `projectRoot` (defaults to `dir`) so output is readable and portable —
 * and, for multi-root layouts, shows which root each finding came from.
 * A single `parseTf` call builds ONE scope, so calling it once per root
 * keeps each root's `var`/`local` values isolated.
 */
export async function parseTf(
  dir: string,
  projectRoot: string = dir,
  environmentOverride?: string,
): Promise<Result<NormalizedResource[], DotzenError>> {
  if (!fs.existsSync(dir)) return err({ kind: 'PathNotFound', path: dir })

  const files = findTfFiles(dir)

  // Pass 1: parse every file (variables/locals may live in a different
  // file from the resources that reference them).
  const parsedFiles: { file: string; text: string; parsed: Hcl2JsonRoot }[] = []
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    try {
      const parsed = (await hcl2json(path.basename(file), text)) as Hcl2JsonRoot
      parsedFiles.push({ file, text, parsed })
    } catch (e) {
      return err({
        kind: 'ParseFailed',
        file,
        detail: e instanceof Error ? e.message : String(e),
      })
    }
  }

  // Pass 2: build the cross-file var/local scope, then normalize with it.
  const scope = buildScope(parsedFiles.map((p) => p.parsed))
  const resources: NormalizedResource[] = []
  for (const { file, text, parsed } of parsedFiles) {
    const rel = toPosix(path.relative(projectRoot, file))
    resources.push(...normalize(parsed, rel, text, scope, environmentOverride))
  }

  return ok(resources)
}
