/**
 * Rule-reference documentation generator (dev/release tool — NOT shipped).
 *
 * Produces `docs/user/reference/rules/` from the actual preset source so the
 * rule catalog never drifts:
 *  - `<preset>.md`      per-preset pages, one section per rule (severity,
 *                       message, resources, conditions rendered human-
 *                       readable, rationale, framework mapping).
 *  - `all-rules.md`     master table (every rule across every preset).
 *  - `resource-index.md` reverse index — resource type → rules that govern it
 *                       (the "per-resource" view), grouped by cloud.
 *
 * Run: `npm run gen-docs` (jiti — pure-JS TS loader, already a dependency).
 * Output is committed; the release gate checks it is fresh.
 *
 * Single source of truth: the preset `.ts` files. Adding a rule → re-run →
 * the docs update. Adding a condition kind → the exhaustive `renderCondition`
 * switch surfaces it at compile time (Layer-4 discipline), forcing a render
 * case before the generator builds.
 */
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { coreSecurity } from '../src/presets/core-security'
import { cisAws } from '../src/presets/cis-aws'
import { cisAzure } from '../src/presets/cis-azure'
import { cisGcp } from '../src/presets/cis-gcp'
import { pciDss } from '../src/presets/pci-dss'
import { soc2 } from '../src/presets/soc2'
import { nist80053 } from '../src/presets/nist-800-53'
import { dataProtection } from '../src/presets/data-protection'
import type { Condition, ResourceTarget, Rule } from '../src/spec/rule'
import type { Effect } from '../src/vocabulary'

/** Preset metadata. `description` is the one piece of hand-written content —
 *  presets don't carry a self-description, so the generator annotates them. */
interface PresetMeta {
  readonly file: string
  readonly title: string
  readonly description: string
  readonly builders: ReadonlyArray<{
    validate(i: number): { ok: boolean; value?: Rule }
  }>
}

const PRESETS: PresetMeta[] = [
  {
    file: 'core-security',
    title: 'Core Security',
    description:
      'The 80% baseline shared across CIS, PCI DSS, SOC 2, NIST 800-53, and ' +
      'GDPR/LGPD. A composable `Rule[]` — spread alongside a framework pack:\n\n' +
      "```ts\nimport { coreSecurity, pciDss } from '@dotzen/dotzen'\n" +
      'export const spec = [...coreSecurity, ...pciDss]\n```\n\n' +
      'Covers network exposure, encryption at rest, IAM least-privilege, ' +
      'audit logging, no hardcoded secrets, required tags, and provisioner ' +
      'denial. Cloud-neutral where possible (AWS-primary; Azure/GCP coverage ' +
      'comes from the per-cloud CIS presets). Each rule carries `.rationale()`.',
    builders: coreSecurity as PresetMeta['builders'],
  },
  {
    file: 'cis-aws',
    title: 'CIS AWS Foundations',
    description:
      'AWS-specific additions on top of `coreSecurity` aligned to the CIS ' +
      'Amazon Web Services Foundations Benchmark. Spread with coreSecurity:\n\n' +
      "```ts\nimport { coreSecurity, cisAws } from '@dotzen/dotzen'\n" +
      'export const spec = [...coreSecurity, ...cisAws]\n```',
    builders: cisAws as PresetMeta['builders'],
  },
  {
    file: 'cis-azure',
    title: 'CIS Azure',
    description:
      'Azure-specific additions on top of `coreSecurity` aligned to the CIS ' +
      'Microsoft Azure Foundations. Spread with coreSecurity:\n\n' +
      "```ts\nimport { coreSecurity, cisAzure } from '@dotzen/dotzen'\n" +
      'export const spec = [...coreSecurity, ...cisAzure]\n```',
    builders: cisAzure as PresetMeta['builders'],
  },
  {
    file: 'cis-gcp',
    title: 'CIS GCP',
    description:
      'GCP-specific additions on top of `coreSecurity` aligned to the CIS ' +
      'Google Cloud Platform Foundation Benchmark. Spread with coreSecurity:\n\n' +
      "```ts\nimport { coreSecurity, cisGcp } from '@dotzen/dotzen'\n" +
      'export const spec = [...coreSecurity, ...cisGcp]\n```',
    builders: cisGcp as PresetMeta['builders'],
  },
  {
    file: 'pci-dss',
    title: 'PCI DSS',
    description:
      'PCI DSS v4.0 additions on top of `coreSecurity`: encrypt ALL resources ' +
      'at rest (not just RDS), all four S3 public-access-block flags, stricter ' +
      'backup retention (≥30 days), encrypted + non-local state, DynamoDB PITR, ' +
      'and no public DB endpoints.',
    builders: pciDss as PresetMeta['builders'],
  },
  {
    file: 'soc2',
    title: 'SOC 2',
    description: 'SOC 2 Trust Services additions on top of `coreSecurity`.',
    builders: soc2 as PresetMeta['builders'],
  },
  {
    file: 'nist-800-53',
    title: 'NIST 800-53',
    description: 'NIST SP 800-53 additions on top of `coreSecurity`.',
    builders: nist80053 as PresetMeta['builders'],
  },
  {
    file: 'data-protection',
    title: 'Data Protection',
    description:
      'Data-protection additions on top of `coreSecurity` (encryption + ' +
      'retention breadth beyond the core baseline).',
    builders: dataProtection as PresetMeta['builders'],
  },
]

const EFFECT_BADGE: Record<Effect, string> = {
  block: '✗ block',
  warn: '‼ warn',
  require_approval: '⏸ require_approval',
}

/** Validate every builder in a preset into a normalized Rule[]. */
function rulesOf(p: PresetMeta): Rule[] {
  const out: Rule[] = []
  p.builders.forEach((b, i) => {
    const v = b.validate(i)
    if (v.ok && v.value) out.push(v.value)
  })
  return out
}

/** Render a condition human-readable. Exhaustive over Condition.kind so a new
 *  kind surfaces at compile time (must add a case before the generator builds). */
function renderCondition(c: Condition): string {
  const list = (xs: readonly unknown[]) => xs.join(', ')
  switch (c.kind) {
    case 'denyIngress':
      return `Deny ingress on ports ${list(c.ports)} from ${list(c.from)}`
    case 'denyEgress':
      return `Deny egress on ports ${list(c.ports)} from ${list(c.from)}`
    case 'mustHaveTags':
      return `Require tags: ${list(c.tags)}`
    case 'mustBeTrue':
      return `Require = true: ${list(c.attrs)}`
    case 'mustBeFalse':
      return `Require = false: ${list(c.attrs)} (absent is the violation)`
    case 'mustBeSet':
      return `Require present (non-empty): ${list(c.attrs)}`
    case 'denyWhenTrue':
      return `Deny = true: ${list(c.attrs)}`
    case 'denyAcl':
      return `Deny ACLs: ${list(c.acls)}`
    case 'mustEqual':
      return `Require ${c.attr} == "${c.value}"`
    case 'mustBeAtLeast':
      return `Require ${c.attr} >= ${c.min}`
    case 'mustBeAtMost':
      return `Require ${c.attr} <= ${c.max}`
    case 'denyIamWildcard':
      return 'Deny IAM wildcard (`Action "*"`, or `NotAction` on an Allow)'
    case 'denyPublicPrincipal':
      return 'Deny `Principal: "*"` on an Allow statement (public access)'
    case 'requireSslOnlyPolicy':
      return 'Require the policy to deny non-SSL transport (`aws:SecureTransport`)'
    case 'listContains':
      return `Deny if list ${c.attr} contains any of: ${list(c.values)}`
    case 'listMustInclude':
      return `Require list ${c.attr} to include all of: ${list(c.values)}`
    case 'denyValue':
      return `Deny ${c.attr} in [${list(c.values)}]`
    case 'mustBeOneOf':
      return `Require ${c.attr} to be one of [${list(c.values)}]`
    case 'denyPlaintextListener':
      return 'Deny plaintext-protocol listener (HTTP/TCP) — HTTPS→redirect exempt'
    case 'denyPrivilegedContainers':
      return 'Deny privileged ECS containers (`privileged = true`)'
    case 'denyPlaintextEnvSecrets':
      return 'Deny plaintext secrets in environment variables'
    case 'denyLiteral':
      return `Deny literal value on ${list(c.attrs)} (a reference is the safe pattern)`
    case 'mustHaveAssociated':
      return `Require an associated \`${c.childType}\` referencing this via \`${c.via}\``
    case 'denyIfAssociated':
      return `Deny if an associated \`${c.childType}\` references this via \`${c.via}\``
    case 'mustHaveBlock':
      return `Require the nested block: \`${c.block}\``
    case 'denyBlockPresence':
      return `Deny the nested block: \`${c.block}\``
    case 'denyIgnoreChanges':
      return `Deny \`lifecycle.ignore_changes\` listing: ${list(c.attrs)}`
    case 'denyProvisioner':
      return `Deny provisioner(s): ${list(c.names)}`
    case 'denyInsensitiveSecretOutput':
      return `Require outputs referencing ${list(c.secretAttrs)} to set \`sensitive = true\``
    case 'denyInsensitiveVariable':
      return 'Deny secret-named `variable`s without `sensitive = true`'
    case 'denyPlaintextLocalSecret':
      return 'Deny plaintext literals in secret-named `locals`'
    case 'requireExactTerraformVersion':
      return 'Require an exact `terraform.required_version` pin (`= X.Y.Z`)'
    case 'denyFloatingProviderVersion':
      return `Require pinned versions for providers: ${list(c.names)}`
    case 'requireEncryptedBackend':
      return 'Require a declared + encrypted state backend'
    case 'denyLocalBackend':
      return 'Deny a local (or absent) state backend'
    case 'denyPlaintextConnectionSecret':
      return 'Deny plaintext secrets in a `connection {}` block'
    case 'denyFloatingModuleVersion':
      return 'Require pinned versions for registry modules'
    case 'denyNonApprovedRegion':
      return `Deny provider region not in the approved list: ${list(c.regions)}`
    case 'requireResource':
      return `Require at least one \`${c.type}\` to exist anywhere in the project (project-level, not per-resource)`
    case 'denyIfReachable': {
      const dir = c.direction ?? 'both'
      return `Deny if this resource can reach a \`${c.targetType}\` via any reference chain (direction: ${dir})`
    }
    case 'denyIfSharedWith':
      return `Deny if this resource shares a \`${c.sharedType}\` with a \`${c.otherType}\` (lateral-movement prevention)`
    case 'denyIfReachableAttr': {
      const dir = c.direction ?? 'both'
      return `Deny if this resource can reach a \`${c.targetType}\` whose \`${c.attr}\` is in [${list(c.values as readonly unknown[])}] (direction: ${dir})`
    }
  }
}

/** Render a resource target. */
function renderTarget(t: ResourceTarget): string {
  if (t.kind === 'all') return 'all resources'
  return t.types.map((tp) => `\`${tp}\``).join(', ')
}

/** The flat list of resource type strings a rule governs (for the reverse index). */
function targetTypes(t: ResourceTarget): readonly string[] {
  return t.kind === 'all' ? ['<all>'] : t.types
}

/** Best-effort parse of framework control IDs from the rationale text.
 *  dotzen stores framework mapping inside the rationale string (not a
 *  structured field), so this is a heuristic — surfacing CIS/PCI/NIST/SOC
 *  references where present. Control IDs contain dots/dashes (5.2, 1.2.1,
 *  AC-17) and are comma/semicolon-separated, so the terminator is `,`/`;`/
 *  newline — NOT a dot (which would truncate "CIS §5.2" to "CIS §5"). */
const FRAMEWORK_RE = /\b(CIS|PCI(?:\s*DSS)?|NIST|SOC\s*2)\b[^,;\n]*/gi
function frameworkMapping(rationale?: string): string[] {
  if (!rationale) return []
  const hits = rationale.match(FRAMEWORK_RE)
  if (!hits) return []
  // Trim trailing whitespace/dashes; dedupe case-insensitively.
  const seen = new Set<string>()
  const out: string[] = []
  for (const h of hits) {
    const clean = h.replace(/[\s—-]+$/, '').trim()
    if (clean && !seen.has(clean.toLowerCase())) {
      seen.add(clean.toLowerCase())
      out.push(clean)
    }
  }
  return out
}

/** Render a single rule as a per-preset subsection. */
function renderRuleSection(r: Rule): string {
  const lines: string[] = []
  lines.push(`### \`${r.id}\``)
  lines.push('')
  lines.push(`- **Severity:** ${EFFECT_BADGE[r.effect]}`)
  if (r.environment)
    lines.push(`- **Scope:** environment = \`${r.environment}\``)
  if (r.providerAlias)
    lines.push(`- **Scope:** provider alias = \`${r.providerAlias}\``)
  if (r.regions && r.regions.length)
    lines.push(`- **Scope:** regions = ${r.regions.join(', ')}`)
  if (r.approvers && r.approvers.length)
    lines.push(`- **Approvers:** ${r.approvers.join(', ')}`)
  lines.push(`- **Resources:** ${renderTarget(r.target)}`)
  lines.push(`- **Conditions:**`)
  for (const c of r.conditions) lines.push(`  - ${renderCondition(c)}`)
  lines.push(`- **Message:** ${r.message}`)
  if (r.rationale) lines.push(`- **Rationale:** ${r.rationale}`)
  const fm = frameworkMapping(r.rationale)
  if (fm.length)
    lines.push(`- **Framework mapping (derived):** ${fm.join('; ')}`)
  lines.push('')
  return lines.join('\n')
}

/** The cloud prefix for a resource type, for grouping the reverse index. */
function cloudOf(type: string): string {
  if (type === '<all>') return 'cross-cutting'
  if (type.startsWith('aws_') || type.startsWith('data.aws_')) return 'AWS'
  if (type.startsWith('azurerm_') || type.startsWith('data.azurerm_'))
    return 'Azure'
  if (type.startsWith('google_') || type.startsWith('data.google_'))
    return 'GCP'
  return 'Other'
}

function buildPerPresetPages(): Array<{ file: string; content: string }> {
  return PRESETS.map((p) => {
    const rules = rulesOf(p)
    const body = [
      `# ${p.title}`,
      '',
      `<!-- AUTO-GENERATED by \`npm run gen-docs\` — do not edit by hand. -->`,
      '',
      p.description,
      '',
      `**${rules.length} rule${rules.length === 1 ? '' : 's'}.**`,
      '',
      '---',
      '',
      '## Rules',
      '',
      ...rules.map(renderRuleSection),
    ].join('\n')
    return { file: `${p.file}.md`, content: body }
  })
}

function buildAllRulesTable(): string {
  const rows: Array<{
    preset: string
    id: string
    effect: Effect
    message: string
    resources: string
  }> = []
  for (const p of PRESETS) {
    for (const r of rulesOf(p)) {
      rows.push({
        preset: p.file,
        id: r.id,
        effect: r.effect,
        message: r.message,
        resources: r.target.kind === 'all' ? 'all' : r.target.types.join(', '),
      })
    }
  }
  const cell = (s: string) =>
    s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ')
  const table = [
    '| Rule ID | Severity | Preset | Message | Resources |',
    '|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| \`${cell(r.id)}\` | ${EFFECT_BADGE[r.effect]} | ${r.preset} | ${cell(
          r.message,
        )} | ${cell(r.resources)} |`,
    ),
  ].join('\n')
  return [
    '# All rules (master table)',
    '',
    '<!-- AUTO-GENERATED by `npm run gen-docs` — do not edit by hand. -->',
    '',
    `Every rule across every preset (${rows.length} total). Sort by severity or`,
    'grep for a resource type. See the per-preset pages for full detail',
    '(conditions, rationale, framework mapping).',
    '',
    table,
    '',
  ].join('\n')
}

function buildResourceIndex(): string {
  // resource type → list of {preset, id, effect}
  const index = new Map<
    string,
    Array<{ preset: string; id: string; effect: Effect }>
  >()
  for (const p of PRESETS) {
    for (const r of rulesOf(p)) {
      for (const t of targetTypes(r.target)) {
        const arr = index.get(t) ?? []
        arr.push({ preset: p.file, id: r.id, effect: r.effect })
        index.set(t, arr)
      }
    }
  }
  // Group by cloud, then alphabetical within cloud.
  const byCloud = new Map<string, string[]>()
  for (const t of index.keys()) {
    const c = cloudOf(t)
    const arr = byCloud.get(c) ?? []
    arr.push(t)
    byCloud.set(c, arr)
  }
  const cloudOrder = ['AWS', 'Azure', 'GCP', 'cross-cutting', 'Other']
  const lines = [
    '# Resource → rules index',
    '',
    '<!-- AUTO-GENERATED by `npm run gen-docs` — do not edit by hand. -->',
    '',
    'Reverse view: for each governed resource type, the rules that apply to it.',
    'Resources not listed here are *recognized* but ungoverned (see the',
    '`ungoverned` output category and `what-it-does.md` → "What dotzen does',
    'not do"). ~60-70 of ~3200 recognized types carry rules today.',
    '',
  ]
  for (const cloud of cloudOrder) {
    const types = (byCloud.get(cloud) ?? []).sort()
    if (types.length === 0) continue
    lines.push(`## ${cloud}`)
    lines.push('')
    for (const t of types) {
      const entries = (index.get(t) ?? []).sort((a, b) =>
        a.id.localeCompare(b.id),
      )
      const rendered = entries
        .map((e) => `\`${e.id}\` (${e.preset}, ${EFFECT_BADGE[e.effect]})`)
        .join('; ')
      lines.push(`- \`${t}\` — ${rendered}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

function main(): void {
  // <repo>/packages/cli/scripts → <repo>/docs/user/reference/rules
  const outDir = join(
    __dirname,
    '..',
    '..',
    '..',
    'docs',
    'user',
    'reference',
    'rules',
  )
  mkdirSync(outDir, { recursive: true })

  for (const page of buildPerPresetPages()) {
    writeFileSync(join(outDir, page.file), page.content + '\n')
    console.log(`  wrote ${page.file}`)
  }
  writeFileSync(join(outDir, 'all-rules.md'), buildAllRulesTable() + '\n')
  console.log('  wrote all-rules.md')
  writeFileSync(join(outDir, 'resource-index.md'), buildResourceIndex() + '\n')
  console.log('  wrote resource-index.md')

  const total = PRESETS.reduce((n, p) => n + rulesOf(p).length, 0)
  console.log(
    `\nGenerated reference for ${total} rules across ${PRESETS.length} presets → ${outDir}`,
  )
}

main()
