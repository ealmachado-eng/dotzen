import * as fs from 'fs'
import * as path from 'path'
import { TerraformRoot } from '../version/config'
import { Environment } from '../vocabulary'

export interface ScaffoldFile {
  readonly path: string
  readonly content: string
}

function dotzenJson(
  version: string,
  terraform: TerraformRoot | TerraformRoot[],
): string {
  return (
    JSON.stringify({ version, spec: '.zen/spec.ts', terraform }, null, 2) + '\n'
  )
}

function specTs(): string {
  return `import { rule, AwsResource, Port, Tag, AwsAttribute, Acl, Provisioner } from '@dotzen/dotzen'

// Prose as Code: each rule reads like a policy statement. Autocomplete
// guides every choice, and a typo is a compile error, not a silent gap.
//
// Curated preset packs — all composable on top of coreSecurity:
//   import { coreSecurity, cisAws } from '@dotzen/dotzen'     // CIS AWS
//   import { coreSecurity, cisAzure } from '@dotzen/dotzen'   // CIS Azure
//   import { coreSecurity, cisGcp } from '@dotzen/dotzen'     // CIS GCP
//   import { coreSecurity, pciDss } from '@dotzen/dotzen'     // PCI DSS
//   import { coreSecurity, soc2 } from '@dotzen/dotzen'       // SOC 2
//   import { coreSecurity, nist80053 } from '@dotzen/dotzen'  // NIST 800-53
//   import { coreSecurity, dataProtection } from '@dotzen/dotzen' // GDPR/LGPD
// Compose multiple framework packs (no duplicate violations):
//   export const spec = [...coreSecurity, ...cisAws, ...pciDss]

export const spec = [
  rule()
    .resource(AwsResource.SecurityGroup)
    .denyIngress(Port.SSH, Port.RDP)
    .message('SSH and RDP must not be open to the internet')
    .rationale('CIS AWS Foundations Benchmark v1.4, control 5.2'),

  rule()
    .resource(
      AwsResource.SecurityGroup,
      AwsResource.DbInstance,
      AwsResource.S3Bucket,
    )
    .mustHaveTags(Tag.Team, Tag.CostCenter, Tag.Environment)
    .message('Required tags missing: team, cost_center, environment')
    .rationale('FinOps ownership + cost allocation policy'),

  rule()
    .resource(AwsResource.DbInstance)
    .mustBeTrue(AwsAttribute.StorageEncrypted)
    .message('RDS instances must have storage encryption at rest'),

  rule()
    .resource(AwsResource.S3Bucket)
    .denyAcl(Acl.PublicRead, Acl.PublicReadWrite)
    .message('S3 buckets must not have a public ACL'),

  // Supply-chain: no arbitrary command execution on apply/destroy.
  rule()
    .allResources()
    .denyProvisioner(Provisioner.LocalExec, Provisioner.RemoteExec)
    .message('Provisioners are forbidden — use user_data / a config manager')
    .rationale('Provisioners run arbitrary commands during apply'),

  // Secrets: mark sensitive variables, never hardcode in locals.
  rule()
    .allResources()
    .denyInsensitiveVariable()
    .message('Secret-looking variables must be marked sensitive'),

  rule()
    .allResources()
    .denyPlaintextLocalSecret()
    .message('Locals must not hardcode secrets — use a reference'),

  // State: encrypted, remote, not local.
  rule()
    .allResources()
    .requireEncryptedBackend()
    .message('State backend must be encrypted'),

  // Suppress a known-acceptable finding with an inline comment:
  //   # dotzen:ignore: <reason>
  //   resource "aws_security_group" "bastion" { ... }
]
`
}

/** The files `dotzen init` writes (pure — no filesystem access). */
export function scaffoldFiles(
  version: string,
  terraform: TerraformRoot | TerraformRoot[] = './terraform',
): ScaffoldFile[] {
  return [
    { path: 'dotzen.json', content: dotzenJson(version, terraform) },
    { path: path.join('.zen', 'spec.ts'), content: specTs() },
  ]
}

const ignored = (rel: string): boolean =>
  rel.split(/[\\/]/).some((p) => p.startsWith('.') || p === 'node_modules')

/**
 * Every directory (relative to `dir`) that contains `.tf` files *directly* —
 * i.e. every Terraform root module. `env/{dev,stg,prd}` yields three.
 */
export function tfRootDirs(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const entries = fs.readdirSync(dir, { recursive: true }) as string[]
  const roots = new Set<string>()
  for (const e of entries) {
    if (!e.endsWith('.tf') || ignored(e)) continue
    const rel = path.dirname(e)
    roots.add(rel === '.' ? '.' : './' + rel.split(/[\\/]/).join('/'))
  }
  return [...roots].sort()
}

// Guess a dotzen Environment from a root folder's leaf name (best-effort;
// the author edits/removes what doesn't fit). Folder names are arbitrary —
// only the mapped value must be a valid Environment.
const ENV_GUESS: Record<string, Environment> = {
  dev: Environment.Development,
  development: Environment.Development,
  sandbox: Environment.Development,
  stg: Environment.Staging,
  stage: Environment.Staging,
  staging: Environment.Staging,
  prd: Environment.Production,
  prod: Environment.Production,
  production: Environment.Production,
}

const withEnvGuess = (rootPath: string): TerraformRoot => {
  const leaf = (rootPath.split('/').pop() ?? '').toLowerCase()
  const environment = ENV_GUESS[leaf]
  return environment ? { path: rootPath, environment } : rootPath
}

/**
 * Detect where a project's existing Terraform lives, so init points
 * `dotzen.json` at the real path(s) instead of a fresh empty `terraform/`.
 * Returns a single path, or an array of roots (multiple, e.g.
 * per-environment) — mapping recognizable env folder names to an
 * `environment` so `.environment(X)` scoping works by folder. Returns
 * undefined for a greenfield project (no .tf yet).
 */
export function detectTerraform(
  dir: string,
): TerraformRoot | TerraformRoot[] | undefined {
  const roots = tfRootDirs(dir)
  if (roots.length === 0) return undefined
  if (roots.length === 1) return roots[0]
  return roots.map(withEnvGuess)
}

export interface InitResult {
  readonly created: string[]
  readonly skipped: string[]
  readonly terraform: TerraformRoot | TerraformRoot[]
  readonly detected: boolean
}

/**
 * Scaffold a new dotzen project into `dir`. Never overwrites an existing
 * file (fail-safe). Adapts `terraform` to an existing layout: an explicit
 * `opts.terraform` wins; otherwise it is auto-detected; a greenfield
 * project falls back to `./terraform` (and that dir is created).
 */
export function initProject(
  dir: string,
  version: string,
  opts: { terraform?: TerraformRoot | TerraformRoot[] } = {},
): InitResult {
  const detected = opts.terraform ?? detectTerraform(dir)
  const terraform = detected ?? './terraform'
  const greenfield = detected === undefined

  const created: string[] = []
  const skipped: string[] = []

  for (const f of scaffoldFiles(version, terraform)) {
    const target = path.join(dir, f.path)
    if (fs.existsSync(target)) {
      skipped.push(f.path)
      continue
    }
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, f.content)
    created.push(f.path)
  }

  // Only scaffold an empty terraform/ dir for a greenfield project.
  if (greenfield) {
    const tf = path.join(dir, 'terraform')
    if (!fs.existsSync(tf)) {
      fs.mkdirSync(tf, { recursive: true })
      created.push('terraform/')
    }
  }

  return { created, skipped, terraform, detected: !greenfield }
}
