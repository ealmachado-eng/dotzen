import { describe, it, expect, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { parseTf, ModuleSkip } from './parse'
import { NormalizedResource } from './model'

const root = (p: string): string => path.join(__dirname, p)

/**
 * Scratch fixture builder (parse-unit layer): mkdir -p, write files, return
 * the temp dir for parseTf. followModules is filesystem-driven (parseDir/
 * findTfFiles), so we exercise it through the public parseTf entry, not the
 * engine — the `check` integration tests cover engine+reporting; these
 * isolate the parse/follow stage.
 *
 * Layout mirrors the real env→module repos (and the integration fixtures):
 * caller in `env/prd/main.tf`, module in `modules/rds/main.tf`, parseTf
 * pointed at the ENV subdir with projectRoot = dir — so the module's files
 * are reached ONLY via followModules, never scanned directly.
 */
function tmpProject(files: Record<string, string>): {
  dir: string
  cleanup: () => void
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotzen-parse-'))
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
  }
  return {
    dir,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  }
}

const dirs: Array<() => void> = []
afterEach(() => {
  while (dirs.length) dirs.pop()?.()
})
const scratch = (files: Record<string, string>): string => {
  const s = tmpProject(files)
  dirs.push(s.cleanup)
  return s.dir
}

const ENV = 'env/prd'
const scan = (dir: string) => parseTf(path.join(dir, ENV), dir)

// A module whose SG ingress cidr_blocks comes from a caller-supplied var.
const moduleRds = `
variable "allowed_cidrs" { type = list(string) }

resource "aws_security_group" "this" {
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidrs
  }
}
`

const sgs = (v: NormalizedResource[]) =>
  v.filter((x) => x.name === 'this' && x.type === 'aws_security_group')

const caller = (body: string): string => `${body}\n`

const skipByLabel = (
  skips: ModuleSkip[],
  label: string,
): ModuleSkip | undefined => skips.find((s) => s.label === label)

describe('parseTf — module-following (followModules, doc 08)', () => {
  it('follows a local ./../../source and threads a literal caller input into var.*', async () => {
    const dir = scratch({
      [`${ENV}/main.tf`]: caller(`module "db" {
  source        = "../../modules/rds"
  allowed_cidrs = ["0.0.0.0/0"]
}`),
      'modules/rds/main.tf': moduleRds,
    })
    const r = await scan(dir)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // env/prd has no direct resources → only the followed module resource.
    expect(r.value.resources).toHaveLength(1)
    expect(r.value.skips).toHaveLength(0)
    const sg = sgs(r.value.resources)[0]
    expect(sg?.ingress[0]?.cidrBlocks[0]).toEqual({
      kind: 'literal',
      value: '0.0.0.0/0',
    })
    // Traced back to the module file relative to projectRoot with the call's
    // per-instantiation label suffix.
    expect(sg?.file).toMatch(/modules[/]rds[/]main\.tf \(db\)$/)
  })

  it('caller input overrides the module variable default', async () => {
    const dir = scratch({
      [`${ENV}/main.tf`]: caller(`module "db" {
  source        = "../../modules/rds"
  allowed_cidrs = ["0.0.0.0/0"]
}`),
      'modules/rds/main.tf': `
variable "allowed_cidrs" {
  type    = list(string)
  default = ["10.0.0.0/8"]
}

resource "aws_security_group" "this" {
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidrs
  }
}
`,
    })
    const r = await scan(dir)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const sg = sgs(r.value.resources)[0]
    expect(sg?.ingress[0]?.cidrBlocks[0]).toEqual({
      kind: 'literal',
      value: '0.0.0.0/0',
    })
  })

  it('uses the module variable default when the caller omits the input', async () => {
    const dir = scratch({
      [`${ENV}/main.tf`]: caller(`module "db" {
  source = "../../modules/rds"
  tags   = { apm_id = "a" }
}`),
      'modules/rds/main.tf': `
variable "allowed_cidrs" {
  type    = list(string)
  default = ["10.0.0.0/8"]
}
variable "tags" { type = map(string) }

resource "aws_security_group" "this" {
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidrs
  }
}
`,
    })
    const r = await scan(dir)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const sg = sgs(r.value.resources)[0]
    // Default threads in — concrete, not "could not evaluate".
    expect(sg?.ingress[0]?.cidrBlocks[0]).toEqual({
      kind: 'literal',
      value: '10.0.0.0/8',
    })
  })

  it('per-instantiation isolation: two calls keep separate scopes AND distinct trace labels', async () => {
    const dir = scratch({
      [`${ENV}/main.tf`]: caller(`module "good" {
  source        = "../../modules/rds"
  allowed_cidrs = ["10.0.0.0/8"]
}
module "bad" {
  source        = "../../modules/rds"
  allowed_cidrs = ["0.0.0.0/0"]
}`),
      'modules/rds/main.tf': moduleRds,
    })
    const r = await scan(dir)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // Two resources (one per call), each evaluated with its own caller scope
    // and tagged with the calling label so findings distinguish instantiations.
    const list = sgs(r.value.resources)
    expect(list).toHaveLength(2)
    const cidrs = list.map((s) => s.ingress[0]?.cidrBlocks[0]).sort()
    expect(cidrs).toEqual([
      { kind: 'literal', value: '0.0.0.0/0' },
      { kind: 'literal', value: '10.0.0.0/8' },
    ])
    const labels = list.map((s) => s.file.match(/\(([^)]+)\)$/)?.[1]).sort()
    expect(labels).toEqual(['bad', 'good'])
  })

  it('resolves a caller input that is itself a var (resolved in caller scope)', async () => {
    const dir = scratch({
      [`${ENV}/main.tf`]: caller(`variable "my_cidrs" {
  type    = list(string)
  default = ["0.0.0.0/0"]
}

module "db" {
  source        = "../../modules/rds"
  allowed_cidrs = var.my_cidrs
}`),
      'modules/rds/main.tf': moduleRds,
    })
    const r = await scan(dir)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const sg = sgs(r.value.resources)[0]
    expect(sg?.ingress[0]?.cidrBlocks[0]).toEqual({
      kind: 'literal',
      value: '0.0.0.0/0',
    })
  })

  it('skips a remote (git::/registry) source — not followed, recorded as a skip (doc 08 DoD)', async () => {
    const dir = scratch({
      [`${ENV}/main.tf`]: caller(`module "db" {
  source        = "git::https://example.com/rds.git"
  allowed_cidrs = ["0.0.0.0/0"]
}`),
      'modules/rds/main.tf': moduleRds,
    })
    const r = await scan(dir)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // Remote source not followed; env/prd has no direct resources.
    expect(r.value.resources).toHaveLength(0)
    // But the gap is recorded (never a silent pass).
    expect(r.value.skips).toHaveLength(1)
    const skip = skipByLabel(r.value.skips, 'db')
    expect(skip?.source).toBe('git::https://example.com/rds.git')
    expect(skip?.reason).toMatch(/remote/)
  })

  it('skips a source that escapes the scanned project root — confinement, recorded as a skip', async () => {
    // A dir OUTSIDE the project root holds a valid module; even though
    // `../../../<sibling>` resolves to a real module on disk, followModules
    // must not leave the scanned project.
    const dir = scratch({
      [`${ENV}/main.tf`]: caller(`module "db" {
  source        = "../../../dotzen-outside-mod"
  allowed_cidrs = ["0.0.0.0/0"]
}`),
      'modules/rds/main.tf': moduleRds,
    })
    const sibling = path.join(path.dirname(dir), 'dotzen-outside-mod')
    fs.mkdirSync(sibling, { recursive: true })
    fs.writeFileSync(path.join(sibling, 'main.tf'), moduleRds)
    dirs.push(() => fs.rmSync(sibling, { recursive: true, force: true }))

    const r = await scan(dir)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.resources).toHaveLength(0)
    const skip = skipByLabel(r.value.skips, 'db')
    expect(skip?.reason).toMatch(/outside the scanned project/)
  })

  it('skips a non-existent module dir — recorded as a skip (not silently passed)', async () => {
    const dir = scratch({
      [`${ENV}/main.tf`]: caller(`module "db" {
  source        = "../../no-such-module"
  allowed_cidrs = ["0.0.0.0/0"]
}`),
    })
    const r = await scan(dir)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.resources).toHaveLength(0)
    const skip = skipByLabel(r.value.skips, 'db')
    expect(skip?.reason).toMatch(/not found/)
  })

  it('threads only non-meta inputs — count/version/providers do not become var.*', async () => {
    const dir = scratch({
      [`${ENV}/main.tf`]: caller(`module "db" {
  source        = "../../modules/rds"
  version       = "1.2.3"
  count         = 1
  providers     = { aws = aws }
  depends_on    = [aws_vpc.main]
  allowed_cidrs = ["0.0.0.0/0"]
}`),
      'modules/rds/main.tf': moduleRds,
    })
    const r = await scan(dir)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const list = sgs(r.value.resources)
    expect(list).toHaveLength(1)
    expect(list[0]?.ingress[0]?.cidrBlocks[0]).toEqual({
      kind: 'literal',
      value: '0.0.0.0/0',
    })
  })

  it('count = 0 disables the module silently — no resources, no skip note (correct, not a gap)', async () => {
    const dir = scratch({
      [`${ENV}/main.tf`]: caller(`module "db" {
  source        = "../../modules/rds"
  count         = 0
  allowed_cidrs = ["0.0.0.0/0"]
}`),
      'modules/rds/main.tf': moduleRds,
    })
    const r = await scan(dir)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.resources).toHaveLength(0)
    // count=0 is intentional absence — no could-not-evaluate gap recorded.
    expect(r.value.skips).toHaveLength(0)
  })

  it('count = var.disabled (resolving to 0) disables the module silently', async () => {
    const dir = scratch({
      [`${ENV}/main.tf`]: caller(`variable "disabled" {
  type    = bool
  default = 0
}

module "db" {
  source        = "../../modules/rds"
  count         = var.disabled
  allowed_cidrs = ["0.0.0.0/0"]
}`),
      'modules/rds/main.tf': moduleRds,
    })
    const r = await scan(dir)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.resources).toHaveLength(0)
    expect(r.value.skips).toHaveLength(0)
  })

  it('count = var.dont_know (unresolvable) is followed once (honest, no expansion)', async () => {
    const dir = scratch({
      [`${ENV}/main.tf`]: caller(`variable "dont_know" {
  type = bool
  # no default
}

module "db" {
  source        = "../../modules/rds"
  count         = var.dont_know
  allowed_cidrs = ["0.0.0.0/0"]
}`),
      'modules/rds/main.tf': moduleRds,
    })
    const r = await scan(dir)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // Cannot prove count==0 → follow once (honest; no key expansion in v1).
    expect(r.value.resources).toHaveLength(1)
    expect(r.value.skips).toHaveLength(0)
  })

  it('skip notes cite the caller file path relative to projectRoot and the block line', async () => {
    const dir = scratch({
      [`${ENV}/main.tf`]: caller(`# line 1 comment
# line 2
module "db" {
  source        = "git::https://example.com/rds.git"
  allowed_cidrs = ["0.0.0.0/0"]
}`),
    })
    const r = await scan(dir)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const skip = skipByLabel(r.value.skips, 'db')
    expect(skip?.file).toMatch(/env[/]prd[/]main\.tf$/)
    // `module "db"` is on line 3 of the caller file.
    expect(skip?.line).toBe(3)
  })
})

describe('parseTf — nested modules (doc 08 tranche 5: module → module)', () => {
  // env → modules/outer → modules/inner. The inner module declares a SG
  // whose cidr_blocks comes from a var the OUTER module threads in from a
  // var the ENV threads in. Two hops of scope-threading must land in the SG.
  const innerModule = `
variable "cidrs" { type = list(string) }

resource "aws_security_group" "this" {
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = var.cidrs
  }
}
`
  const outerModule = `
variable "allowed_cidrs" { type = list(string) }

module "inner_db" {
  source = "../inner"
  cidrs  = var.allowed_cidrs
}
`

  it('follows a nested module chain — callers inputs thread two hops to a concrete verdict', async () => {
    const dir = scratch({
      [`${ENV}/main.tf`]: caller(`module "db" {
  source        = "../../modules/outer"
  allowed_cidrs = ["0.0.0.0/0"]
}`),
      'modules/outer/main.tf': outerModule,
      'modules/inner/main.tf': innerModule,
    })
    const r = await scan(dir)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // Only the inner module has a resource; it must be reached two hops down.
    const list = sgs(r.value.resources)
    expect(list).toHaveLength(1)
    expect(list[0]?.ingress[0]?.cidrBlocks[0]).toEqual({
      kind: 'literal',
      value: '0.0.0.0/0',
    })
    // Trace traverses BOTH hops with the per-instantiation label chain — the
    // outer (db) label appears before the inner (inner_db) leaf resource.
    const trace = list[0]?.file ?? ''
    expect(trace).toMatch(/\(db\)/)
    expect(trace).toMatch(/modules[/]inner[/]main\.tf \(inner_db\)$/)
    expect(trace).toMatch(/modules[/]outer[/]main\.tf/)
    expect(r.value.skips).toHaveLength(0)
  })

  it('two independent paths to the same leaf module are evaluated once per path', async () => {
    // env → outer_a → inner (cidrs from root var A)
    // env → outer_b → inner (cidrs from root var B)
    // Per-instance isolation + nested recursion: inner is evaluated twice,
    // each with the scoped cidrs of its path, producing 2 distinct SGs.
    const dir = scratch({
      [`${ENV}/main.tf`]: caller(`module "a" {
  source        = "../../modules/outer"
  allowed_cidrs = ["10.0.0.0/8"]
}
module "b" {
  source        = "../../modules/outer"
  allowed_cidrs = ["0.0.0.0/0"]
}`),
      'modules/outer/main.tf': outerModule,
      'modules/inner/main.tf': innerModule,
    })
    const r = await scan(dir)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const list = sgs(r.value.resources)
    expect(list).toHaveLength(2)
    const cidrs = list
      .map((s) => (s.ingress[0]?.cidrBlocks[0] as { value?: string }).value)
      .sort()
    expect(cidrs).toEqual(['0.0.0.0/0', '10.0.0.0/8'])
  })

  it('detects a module cycle and records a skip rather than looping', async () => {
    // outer calls inner, inner calls outer (a mutual cycle). followModules
    // must bound via the path-stack and emit a cycle skip — NOT recurse
    // forever or false-violate.
    const cycleOuter = `
module "back" {
  source = "../inner"
}
`
    const cycleInner = `
module "back" {
  source = "../outer"
}
`
    const dir = scratch({
      [`${ENV}/main.tf`]: caller(`module "db" {
  source = "../../modules/outer"
}`),
      'modules/outer/main.tf': cycleOuter,
      'modules/inner/main.tf': cycleInner,
    })
    const r = await scan(dir)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // No resources on either side (only module blocks), and at least one
    // cycle skip is recorded.
    expect(r.value.resources).toHaveLength(0)
    expect(r.value.skips.length).toBeGreaterThanOrEqual(1)
    expect(r.value.skips.some((s) => /cycle/i.test(s.reason))).toBe(true)
  })
})

describe('parseTf — for_each on module blocks (doc 08 tranche 5)', () => {
  const forEachModule = `
variable "env_name" { type = string }

resource "aws_security_group" "this" {
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["${'${each.value}'}"]
  }
  tags = { env = "${'${each.value}'}" }
}
`

  it('expands for_each over a literal map — one instance per key, each.value threaded', async () => {
    const dir = scratch({
      [`${ENV}/main.tf`]: caller(`module "db" {
  source   = "../../modules/rds"
  for_each = {
    dev = "10.0.0.0/8"
    prd = "0.0.0.0/0"
  }
  env_name = each.key
}`),
      'modules/rds/main.tf': forEachModule,
    })
    const r = await scan(dir)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // Two SG instances — one per for_each key — each with its own cidr.
    const list = sgs(r.value.resources)
    expect(list).toHaveLength(2)
    const cidrs = list
      .map((s) => (s.ingress[0]?.cidrBlocks[0] as { value?: string }).value)
      .sort()
    expect(cidrs).toEqual(['0.0.0.0/0', '10.0.0.0/8'])
    // Per-key trace label: (db[<key>]) — distinguishable instantiations.
    const labelOf = (s: { file: string }) =>
      s.file.match(/\((db\[[^\]]+\])\)/)?.[1]
    expect(list.map(labelOf).sort()).toEqual(['db[dev]', 'db[prd]'])
    expect(r.value.skips).toHaveLength(0)
  })

  it('expands for_each over a var-resolved list — caller default threads to elements', async () => {
    const dir = scratch({
      [`${ENV}/main.tf`]: caller(`variable "envs" {
  type    = list(string)
  default = ["dev", "prd"]
}

module "db" {
  source   = "../../modules/rds"
  for_each = var.envs
}`),
      'modules/rds/main.tf': forEachModule,
    })
    const r = await scan(dir)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const list = sgs(r.value.resources)
    expect(list).toHaveLength(2)
    // Per-instance trace shows the for_each element as the key (toset rule).
    const labels = list
      .map((s) => s.file.match(/\(db\[([^\]]+)\]\)/)?.[1])
      .sort()
    expect(labels).toEqual(['dev', 'prd'])
  })

  it('for_each = toset([...]) (compound, unresolvable) — followed once, each.value stays unresolved (honest)', async () => {
    // toset(...) is a compound expression resolveRaw cannot unwrap, so the
    // collection is not statically knowable. followModules follows once,
    // WITHOUT each bindings — any each.* ref inside degrades to unresolved
    // (could-not-evaluate) via the engine. No false expansion.
    const dir = scratch({
      [`${ENV}/main.tf`]: caller(`module "db" {
  source   = "../../modules/rds"
  for_each = toset(["dev", "prd"])
}`),
      'modules/rds/main.tf': forEachModule,
    })
    const r = await scan(dir)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // One instance, not two; trace has plain (db) label, no [key].
    const list = sgs(r.value.resources)
    expect(list).toHaveLength(1)
    expect(list[0]?.file).toMatch(/\(db\)$/)
  })

  it('for_each = var.x (var no default — unresolvable) — followed once (honest)', async () => {
    const dir = scratch({
      [`${ENV}/main.tf`]: caller(`variable "unset" {
  type = list(string)
}

module "db" {
  source   = "../../modules/rds"
  for_each = var.unset
}`),
      'modules/rds/main.tf': forEachModule,
    })
    const r = await scan(dir)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(sgs(r.value.resources)).toHaveLength(1)
  })
})

describe('parseTf — direct (non-module) behavior', () => {
  it('returns PathNotFound when the terraform directory is missing', async () => {
    const r = await parseTf(root('./no/such/terraform/dir'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('PathNotFound')
  })
})
