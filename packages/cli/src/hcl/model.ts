import { AnyResource } from '../vocabulary'

/**
 * dotzen's own resource model. The engine only ever sees this — never the
 * parser's raw output (doc 06). Unresolvable expressions are explicit,
 * which is what feeds the `couldNotEvaluate` outcome.
 */

/**
 * A resource reference (`<type>.<name>`) that a `var`/`local` chain was
 * followed to at normalize time. Populated ONLY when the chain bottoms
 * out at a sole `${<type>.<name>.<attr>}` expression — the engine's
 * association index uses this to link a child to its parent through
 * local indirection (`bucket = local.bucket_id` where
 * `local.bucket_id = aws_s3_bucket.main.id`), without needing scope
 * access at evaluate time. Absent for direct refs (the existing
 * `RESOURCE_REF` regex handles those) and for unresolvable chains
 * (the `expr` still starts with `${var.` / `${local.` in that case).
 */
export interface ResolvedRef {
  readonly type: string
  readonly name: string
}

export type NormalizedValue =
  | { readonly kind: 'literal'; readonly value: string | number | boolean }
  | {
      readonly kind: 'unresolved'
      readonly expr: string
      readonly resolvedRef?: ResolvedRef
    }

export interface IngressRule {
  readonly fromPort: NormalizedValue
  readonly toPort: NormalizedValue
  readonly cidrBlocks: NormalizedValue[]
}

/**
 * Tags are either statically knowable (a literal map, so we know which
 * keys are present) or unresolved (e.g. `tags = var.tags` / `merge(...)`),
 * which must degrade to "could not evaluate" rather than a false verdict.
 */
export type TagsInfo =
  // Every key is known (a literal map, or a reference resolved to one).
  | { readonly kind: 'resolved'; readonly keys: string[] }
  // These keys are known-present, but the set may be incomplete — e.g.
  // `merge(<literal>, var.tags)`, where var.tags could add more. Presence is
  // provable; absence is not, so a missing required tag => could-not-evaluate.
  | { readonly kind: 'partial'; readonly keys: string[] }
  | { readonly kind: 'unresolved' }

/** One IAM policy statement (from a parsed literal-JSON or jsonencode document). */
export interface PolicyStatement {
  readonly effect: string
  readonly actions: string[]
  readonly resources: string[]
  /** `NotAction` entries — an Allow with NotAction is an over-broad grant. */
  readonly notActions: string[]
  /**
   * `Principal` entries — all string values from the Principal field,
   * flattened (a bare `"*"` → `["*"]`; `{ "AWS": "*" }` → `["*"]`;
   * `{ "AWS": ["arn:...", "*"] }` → `["arn:...", "*"]`). Empty `[]` when
   * absent. Used by `denyPublicPrincipal` to flag `Principal: "*"` in
   * Allow statements (public access).
   */
  readonly principals: string[]
  /**
   * `Condition` block, keyed by operator then key, with string-list values.
   * Empty `{}` when absent or when any value is unresolvable (a `${var.x}`
   * inside a Condition value means we cannot know the condition statically,
   * so we do not use it — the statement still parses for Action/Resource
   * checks). Populated for literal `jsonencode(...)` Condition blocks.
   */
  readonly conditions: Record<string, Record<string, string[]>>
}

/**
 * An IAM `policy` argument: parsed when it is a literal JSON document
 * (heredoc / inline string) OR a `jsonencode(<HCL literal>)` expression;
 * `unresolved` when it is a `jsonencode(var.x)` / `local.x` / a bare
 * variable, or malformed — which must degrade to "could not evaluate"
 * rather than a guess.
 */
export type PolicyInfo =
  | { readonly kind: 'parsed'; readonly statements: PolicyStatement[] }
  | { readonly kind: 'unresolved' }

/** A list-valued attribute (array of scalars), for `listContains`/`listMustInclude`. */
export type ListInfo =
  | { readonly kind: 'resolved'; readonly items: NormalizedValue[] }
  | { readonly kind: 'unresolved' }

/** One ECS container environment variable (from `container_definitions`). */
export interface EnvVar {
  readonly name: string
  /** The raw value string (may contain `${...}` if it's a reference). */
  readonly value: string
  /** true = a plaintext literal (potential secret); false = a `${...}` reference. */
  readonly isLiteral: boolean
}

/** One ECS container (from a parsed literal-JSON or jsonencode `container_definitions`). */
export interface ContainerDef {
  readonly name: string
  readonly privileged: boolean
  /** true if `privileged` was an interpolated (unresolved) value — the engine
   *  degrades to could-not-evaluate for `denyPrivilegedContainers` in that case. */
  readonly privilegedUnresolved?: boolean
  /** Environment variables (for `denyPlaintextEnvSecrets`). Empty if none. */
  readonly environment: EnvVar[]
}

export type ContainerInfo =
  | { readonly kind: 'parsed'; readonly containers: ContainerDef[] }
  | { readonly kind: 'unresolved' }

/**
 * Environment variables extracted from a serverless function's env-var MAP
 * (not the ECS `container_definitions` JSON — that lives in `containers`).
 * Sources: aws_lambda_function `environment.variables`, Azure Functions
 * `app_settings`, GCP Cloud Run Functions `service_config.environment_variables`.
 * Same EnvVar shape (name/value/isLiteral) so `denyPlaintextEnvSecrets` scans
 * both `containers` and `envVars` with one code path. `unresolved` when the
 * whole map is a `var.x` / `local.x` reference the engine cannot expand.
 */
export type EnvVarsInfo =
  | { readonly kind: 'parsed'; readonly vars: EnvVar[] }
  | { readonly kind: 'unresolved' }

export interface NormalizedResource {
  readonly type: AnyResource
  readonly name: string
  readonly file: string
  readonly line: number
  /**
   * The provider alias the resource is pinned to (`provider = aws.dr` → "dr"),
   * or undefined for the default provider. A rule can scope by alias with
   * `.providerAlias(X)` (e.g. govern only resources in the dr account/region).
   * The alias is the discriminator — dotzen does not map alias→region (the
   * alias itself is the org's handle for "which account/region provider").
   */
  readonly providerAlias?: string
  /**
   * The provider's region for this resource (resolved from the `provider {}`
   * block matching the resource's alias, or the default provider). Used for
   * GDPR/LGPD data-residency rules (`.region(...)` scoping +
   * `denyNonApprovedRegion`). Absent when the provider block declares no
   * region (the resource's region is then unknown — degrades to
   * could-not-evaluate for residency rules).
   */
  readonly providerRegion?: NormalizedValue
  /**
   * The `for_each` element key when this resource is one of several expanded
   * instances (e.g. `for_each = toset(["dev","prd"])` → two instances with
   * instanceKey "dev" / "prd"). Absent for a plain single-instance resource
   * and for an UNRESOLVABLE for_each (followed once, no key). Used only for
   * DISPLAY (the violation `resource` field shows `type.name[key]`); the
   * association index and `address()` use the BASE `type.name` so a child
   * referencing `aws_s3_bucket.x.id` matches regardless of which instance
   * (the static tool cannot disambiguate instances — that is honest).
   */
  readonly instanceKey?: string
  readonly ingress: IngressRule[]
  /** Egress rules (security groups). Optional — absent means none. */
  readonly egress?: IngressRule[]
  readonly tags: TagsInfo
  /** Scalar attributes (nested blocks flattened to dotted keys). */
  readonly attributes: Record<string, NormalizedValue>
  /** List-valued attributes (arrays of scalars), by dotted key. */
  readonly lists?: Record<string, ListInfo>
  /** Dotted paths of every nested block declared (even empty ones), for
   *  `mustHaveBlock` / `denyBlockPresence`. */
  readonly blocks?: string[]
  /** Resolved value of the `environment` tag, if present — used for rule scoping. */
  readonly environment?: NormalizedValue
  /** Parsed IAM `policy` document, if the resource has one. */
  readonly policy?: PolicyInfo
  /** Parsed ECS `container_definitions`, if the resource has them. */
  readonly containers?: ContainerInfo
  /** Parsed serverless env-var map (Lambda/Azure Functions/Cloud Run Functions),
   *  for `denyPlaintextEnvSecrets`. */
  readonly envVars?: EnvVarsInfo
  /**
   * Provisioner types declared on the resource (the `"x"` in
   * `provisioner "x" {}`), e.g. `['local-exec', 'remote-exec']`. Empty/absent
   * when the resource declares no provisioners. Used by `denyProvisioner` to
   * flag arbitrary-command execution (a supply-chain / exfiltration surface).
   */
  readonly provisioners?: string[]
}

/**
 * A normalized Terraform `output` block. Outputs are a separate surface from
 * resources — a `denyInsensitiveSecretOutput` rule governs them (an output
 * referencing a secret-bearing attribute without `sensitive = true` leaks it
 * in state / CI logs). `sensitive` is a literal `true`/`false` (or absent →
 * false), or `'unresolved'` when the flag is a var/local the tool can't
 * statically resolve (degrades to could-not-evaluate, not a guess).
 */
export interface NormalizedOutput {
  readonly name: string
  readonly file: string
  readonly line: number
  /** The output's `value` expression (a literal or an unresolved ref). */
  readonly value: NormalizedValue
  /** `sensitive = true|false` (false when absent), or 'unresolved' for a var. */
  readonly sensitive: boolean | 'unresolved'
}

/**
 * A normalized named-value binding: either a `variable` block (has a
 * `sensitive` flag) or a `locals` entry. A separate surface from resources
 * (like outputs) — `denyInsensitiveVariable` governs variables whose name
 * looks like a secret but lack `sensitive = true`, and
 * `denyPlaintextLocalSecret` flags a `local` whose secret-shaped name holds a
 * plaintext literal (not a reference). Both reuse the engine's shared
 * secret-name detector.
 */
export interface NormalizedBinding {
  readonly kind: 'variable' | 'local'
  readonly name: string
  readonly file: string
  readonly line: number
  /** variable: `sensitive = true|false` (absent → false), or `'unresolved'`
   *  when the flag is a var ref. local: always false (no sensitive flag). */
  readonly sensitive: boolean | 'unresolved'
  /** true when the value is a plaintext literal (a scalar, not a `${ref}`).
   *  For `denyPlaintextLocalSecret` — a referenced secret is the safe pattern. */
  readonly isLiteral: boolean
  /** variable: the raw `type` constraint (e.g. `'${bool}'`, `'${number}'`,
   *  `'${string}'`, `'${list(string)}'`), or undefined when no type is
   *  declared. Used by `denyInsensitiveVariable` to skip `bool`/`number`
   *  variables (a boolean/numeric config flag is definitionally not a
   *  secret value). local: always undefined. */
  readonly type?: string
}

/**
 * Normalized `terraform {}` settings block — `required_version` (the TF engine
 * constraint), `required_providers` (per-provider version constraints), and the
 * `backend` (state storage). A separate surface from resources;
 * `requireExactTerraformVersion` and `denyFloatingProviderVersion` govern
 * version pinning, and `requireEncryptedBackend` / `denyLocalBackend` govern
 * state storage (an unencrypted / local backend leaks state — catastrophic).
 */
export interface NormalizedBackend {
  /** Backend type (`s3`, `gcs`, `azurerm`, `local`, `remote`, …). */
  readonly type: string
  /** `encrypt = true` (S3/GCS) → true; absent → false; a var ref → 'unresolved'.
   *  undefined when the backend type has no `encrypt` concept (e.g. `local`). */
  readonly encrypted?: boolean | 'unresolved'
  /** A dynamodb_table (state locking) declared? Absent → false. */
  readonly locked: boolean
}

export interface NormalizedTerraformSettings {
  readonly requiredVersion?: string
  readonly requiredProviders: {
    readonly name: string
    readonly version: string
  }[]
  /** The `backend "<type>" {}` block, or undefined when no backend is declared
   *  (Terraform then uses the local `terraform.tfstate` default — unencrypted,
   *  unlocked, not shared → the `denyLocalBackend` / `requireEncryptedBackend`
   *  rules flag it). */
  readonly backend?: NormalizedBackend
  readonly file: string
  readonly line: number
}

/**
 * A normalized `module {}` CALL (not the followed module's resources) — the
 * call-site metadata: label, source, version constraint, and whether the
 * source is a registry module (non-local). A separate surface;
 * `denyFloatingModuleVersion` governs registry modules' version constraints
 * (a floating/absent `version` lets `terraform init` pull a different module
 * revision → supply-chain drift). Local modules (`./`/`../`) carry no version
 * and are never flagged.
 */
export interface NormalizedModuleCall {
  readonly label: string
  readonly source: string
  /** `version = "~> 5.0"` constraint, or undefined when not declared. */
  readonly version?: string
  /** true when the source is a registry module (not a local `./`/`../` path). */
  readonly registry: boolean
  readonly file: string
  readonly line: number
}

export const address = (r: NormalizedResource): string => `${r.type}.${r.name}`

/**
 * Display address — the base `type.name` plus the `for_each` instance key in
 * brackets when present (`aws_s3_bucket.x[prd]`). Used in violation /
 * could-not-evaluate output so a user can tell instances apart. Association
 * logic uses `address()` (base only) since a child ref cannot name a specific
 * instance statically.
 */
export const displayAddress = (r: NormalizedResource): string =>
  r.instanceKey ? `${address(r)}[${r.instanceKey}]` : address(r)
