/**
 * Profiles + presets for `pluvian init --profile <name>` / `--presets <list>`.
 *
 * The 8 preset packs are the composable PRIMITIVES (the real product surface);
 * the 3 profiles are curated BUNDLES that compose presets AND add bespoke rules
 * the presets don't carry (ownership tags, prod change-safety gates, data
 * residency). Both flags work together: `--profile enterprise --presets pciDss`
 * = enterprise's presets ∪ pciDss (deduped) + enterprise's bespoke rules.
 *
 * This module is the SINGLE SOURCE OF TRUTH for both `pluvian init` (which
 * composes a spec from --profile/--presets) and the `examples/` specs (which
 * are generated from the same data by `scripts/gen-examples.ts`). That keeps
 * the init output and the example templates from drifting apart.
 */

/** The 8 composable preset packs — the valid values for `--presets`. */
export const PRESET_NAMES = [
  'coreSecurity',
  'cisAws',
  'cisAzure',
  'cisGcp',
  'pciDss',
  'soc2',
  'nist80053',
  'dataProtection',
] as const
export type PresetName = (typeof PRESET_NAMES)[number]

/** The 3 curated org profiles — the valid values for `--profile`. */
export const PROFILE_NAMES = ['startup', 'enterprise', 'regulated'] as const
export type ProfileName = (typeof PROFILE_NAMES)[number]

export const isValidPreset = (x: string): x is PresetName =>
  (PRESET_NAMES as readonly string[]).includes(x)
export const isValidProfile = (x: string): x is ProfileName =>
  (PROFILE_NAMES as readonly string[]).includes(x)

export interface Profile {
  readonly name: ProfileName
  /** Preset packs the profile composes (spread into the spec). */
  readonly presets: readonly PresetName[]
  /** Value imports needed by bespokeDecls/bespokeRules (rule, AwsResource, …). */
  readonly bespokeImports: readonly string[]
  /** Enum/type declarations above the export (OrgTag, ApprovedRegion, …). */
  readonly bespokeDecls: string
  /** rule() lines inside the spec array (may include comments). */
  readonly bespokeRules: string
  /** The example docblock (used when generating examples/). */
  readonly docblock: string
}

export const PROFILES: Record<ProfileName, Profile> = {
  startup: {
    name: 'startup',
    presets: ['coreSecurity'],
    bespokeImports: ['rule', 'Tag', 'Effect'],
    bespokeDecls: '',
    bespokeRules: `  // Ownership — one tag, warn severity (don't block the startup on a missing
  // label). Upgrade to Effect.Block once tag hygiene is established.
  rule()
    .allResources()
    .mustHaveTags(Tag.Team)
    .onViolation(Effect.Warn)
    .message('Resources must carry a team tag for ownership and cost attribution')
    .rationale(
      'A single ownership signal enables oncall routing, cost attribution, ' +
        'and blast-radius analysis — the minimum viable governance metadata.',
    ),`,
    docblock: `/**
 * Startup profile — secure-by-default baseline, minimal friction.
 *
 * Generated from the \`startup\` profile (\`pluvian init --profile startup\`).
 * Spreads \`coreSecurity\` (no hardcoded secrets, no public SSH/RDP, at-rest
 * encryption, public-access denials, floating-version pinning) and adds a
 * single ownership tag. Designed to run on every PR with zero tuning.
 *
 * Grow into enterprise/regulated by adding \`--presets\` or switching
 * \`--profile\`; or edit this file directly.
 */`,
  },

  enterprise: {
    name: 'enterprise',
    presets: ['coreSecurity', 'cisAws', 'cisAzure', 'cisGcp'],
    bespokeImports: [
      'rule',
      'AwsResource',
      'Tag',
      'Effect',
      'Environment',
      'Approver',
      'LifecycleAttribute',
    ],
    bespokeDecls: `// Org-specific tag taxonomy (tag KEYS are org-defined — declare them as an
// enum so a typo is a compile error, not a silently-never-fires rule).
enum OrgTag {
  Application = 'Application',
  Owner = 'Owner',
  CostCenter = 'cost_center',
}`,
    bespokeRules: `  // ── Ownership metadata across the estate ─────────────────────────────
  rule()
    .allResources()
    .mustHaveTags(OrgTag.Application, OrgTag.Owner, Tag.Environment)
    .onViolation(Effect.Block)
    .message('Resources must carry Application, Owner, and environment tags')
    .rationale(
      'Enterprise ownership metadata: cost attribution, blast-radius ' +
        'routing, and change-advisory notifications all depend on it.',
    ),

  // ── Production change-safety: no accidental destruction ──────────────
  // Stateful prod resources must opt into \`prevent_destroy\`. A resource
  // without it is allowed (the team may have a reason) but the change
  // pauses CI for security + SRE sign-off — RequireApproval, not Block.
  rule()
    .resource(
      AwsResource.DbInstance,
      AwsResource.RdsCluster,
      AwsResource.ElasticacheReplicationGroup,
      AwsResource.S3Bucket,
    )
    .environment(Environment.Production)
    .mustBeTrue(LifecycleAttribute.PreventDestroy)
    .onViolation(Effect.RequireApproval)
    .approvers(Approver.SecurityArchitect, Approver.SRE)
    .message(
      'Stateful production resources should set prevent_destroy — approval ' +
        'required to merge without it',
    )
    .rationale(
      'Accidental destruction of stateful prod resources (RDS, ElastiCache, ' +
        'S3) is the #1 cause of unrepeatable outages. prevent_destroy makes ' +
        'destroy a conscious, reviewed two-step action.',
    ),`,
    docblock: `/**
 * Enterprise profile — multi-cloud CIS baselines + ownership metadata +
 * change-safety gates for production.
 *
 * Generated from the \`enterprise\` profile (\`pluvian init --profile enterprise\`).
 * Spreads coreSecurity + the three CIS packs, then adds mandatory ownership
 * tags + a production prevent_destroy approval gate. Edit the OrgTag enum +
 * the approver set / stateful types to match your org.
 */`,
  },

  regulated: {
    name: 'regulated',
    presets: [
      'coreSecurity',
      'cisAws',
      'cisAzure',
      'cisGcp',
      'pciDss',
      'soc2',
      'nist80053',
      'dataProtection',
    ],
    bespokeImports: ['rule', 'Effect'],
    bespokeDecls: `// Regions where regulated/personal data may be processed (GDPR example —
// edit to your jurisdiction: LGPD → sa-east-1 / southamerica-east1, etc.).
// Declared as an enum so a typo'd region code is a compile error.
enum ApprovedRegion {
  EuWest1 = 'eu-west-1',
  EuWest2 = 'eu-west-2',
  EuCentral1 = 'eu-central-1',
  WestEurope = 'westeurope',
  NorthEurope = 'northeurope',
  EuropeWest1 = 'europe-west1',
  EuropeWest3 = 'europe-west3',
}`,
    bespokeRules: `  // ── Data sovereignty: resources must run in an approved region ───────
  // A resource whose provider region is NOT in the approved set violates;
  // an unknown region degrades to could-not-evaluate (never a false pass).
  rule()
    .allResources()
    .denyNonApprovedRegion(
      ApprovedRegion.EuWest1,
      ApprovedRegion.EuWest2,
      ApprovedRegion.EuCentral1,
      ApprovedRegion.WestEurope,
      ApprovedRegion.NorthEurope,
      ApprovedRegion.EuropeWest1,
      ApprovedRegion.EuropeWest3,
    )
    .onViolation(Effect.Block)
    .message('Resources must run in an approved region (data residency)')
    .rationale(
      'GDPR Art. 44–49 / LGPD Art. 11 — personal data must not leave its ' +
        'jurisdiction. Restricting deployable regions enforces this at the ' +
        'infrastructure layer, before any data is written.',
    ),`,
    docblock: `/**
 * Regulated profile — the full compliance stack + data sovereignty.
 *
 * Generated from the \`regulated\` profile (\`pluvian init --profile regulated\`).
 * Spreads every shipped framework pack (PCI/SOC2/NIST/data-protection) on top
 * of the CIS baselines and adds a data-residency control. Edit the
 * ApprovedRegion enum to your jurisdiction + drop frameworks you don't need.
 */`,
  },
}

const dedupeStrings = (xs: readonly string[]): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of xs)
    if (!seen.has(x)) {
      seen.add(x)
      out.push(x)
    }
  return out
}

/**
 * Resolve the preset list to spread into the spec. Rules:
 *  - no profile AND no extra presets → `['coreSecurity']` (the default baseline);
 *  - `--profile X` → the profile's presets, plus any extra presets not already
 *    in it (deduped — duplicate rule IDs are a load error, so never double-spread);
 *  - `--presets a,b` with no profile → exactly `[a, b]` (explicit; no implicit
 *    baseline — add `coreSecurity` yourself if you want it).
 */
export function composedPresets(
  profile?: ProfileName,
  extra?: readonly string[],
): PresetName[] {
  if (profile === undefined && (extra === undefined || extra.length === 0)) {
    return ['coreSecurity']
  }
  const base = profile ? [...PROFILES[profile].presets] : []
  const seen = new Set(base)
  for (const e of extra ?? []) {
    if (isValidPreset(e) && !seen.has(e)) {
      base.push(e)
      seen.add(e)
    }
  }
  return base
}

const renderImports = (imports: readonly string[]): string => {
  // Multi-line when there are many (readability), single-line when few.
  if (imports.length <= 5) {
    return `import { ${imports.join(', ')} } from '@erkos/pluvian'`
  }
  return `import {\n  ${imports.join(',\n  ')},\n} from '@erkos/pluvian'`
}

const defaultInitHeader = (
  profile: ProfileName | undefined,
  presetList: readonly PresetName[],
): string => {
  const composed =
    profile !== undefined
      ? `--profile ${profile}${presetList.length > PROFILES[profile].presets.length ? ' + --presets' : ''}`
      : `--presets ${presetList.join(',')}`
  return `/**\n * pluvian spec — generated by \`pluvian init\` (${composed}).\n * Edit presets + rules to fit your org, then run \`npx @erkos/pluvian check\`.\n */`
}

export interface ComposeOptions {
  readonly profile?: ProfileName
  /** Extra presets from `--presets` (already-split list). */
  readonly presets?: readonly string[]
  /** Top comment block. Defaults to a short init note; examples pass the docblock. */
  readonly header?: string
}

/** Compose the full `.pluvian/spec.ts` content from a profile + extra presets. */
export function composeSpec(opts: ComposeOptions = {}): string {
  const prof = opts.profile !== undefined ? PROFILES[opts.profile] : undefined
  const presetList = composedPresets(opts.profile, opts.presets)
  const imports = dedupeStrings([
    ...presetList,
    ...(prof?.bespokeImports ?? []),
  ])
  const header = opts.header ?? defaultInitHeader(opts.profile, presetList)
  const importLine = renderImports(imports)
  const decls = prof?.bespokeDecls ? `\n${prof.bespokeDecls}\n` : ''
  const spread = presetList.map((p) => `  ...${p},`).join('\n')
  const rules = prof?.bespokeRules ? `${prof.bespokeRules}\n` : ''
  return `${header}\n\n${importLine}\n${decls}\nexport const spec = [\n${spread}\n${rules}]\n`
}
