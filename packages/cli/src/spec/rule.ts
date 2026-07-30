import {
  Port,
  Cidr,
  Effect,
  Tag,
  Acl,
  Environment,
  Approver,
  Block,
  Provisioner,
  AnyResource,
  AnyAttribute,
} from '../vocabulary'
import { Result, ok, err } from '../result/result'
import { RuleValidationError } from '../result/errors'

export type ResourceTarget =
  | { readonly kind: 'resource'; readonly types: AnyResource[] }
  | { readonly kind: 'all' }

/** Discriminated union so the engine dispatches one evaluator per kind. */
export type Condition =
  | {
      readonly kind: 'denyIngress'
      readonly ports: Port[]
      readonly from: Cidr[]
    }
  | {
      readonly kind: 'denyEgress'
      readonly ports: Port[]
      readonly from: Cidr[]
    }
  | { readonly kind: 'mustHaveTags'; readonly tags: string[] }
  | { readonly kind: 'mustBeTrue'; readonly attrs: AnyAttribute[] }
  | { readonly kind: 'mustBeFalse'; readonly attrs: AnyAttribute[] }
  // AwsAttribute must be present (any value — literal or reference); absent is
  // the violation. For "must configure X" where any value beats the default,
  // e.g. CloudTrail `kms_key_id`.
  | { readonly kind: 'mustBeSet'; readonly attrs: AnyAttribute[] }
  | { readonly kind: 'denyWhenTrue'; readonly attrs: AnyAttribute[] }
  | { readonly kind: 'denyAcl'; readonly acls: Acl[] }
  | {
      readonly kind: 'mustEqual'
      readonly attr: AnyAttribute
      readonly value: string
    }
  | {
      readonly kind: 'mustBeAtLeast'
      readonly attr: AnyAttribute
      readonly min: number
    }
  | {
      readonly kind: 'mustBeAtMost'
      readonly attr: AnyAttribute
      readonly max: number
    }
  | { readonly kind: 'denyIamWildcard' }
  // Flag an Allow statement with `Principal: "*"` (public access — everyone
  // can access the resource). CIS AWS: S3 bucket policies should not grant
  // public access.
  | { readonly kind: 'denyPublicPrincipal' }
  // Require the resource's `policy` to deny non-SSL transport — a `Deny`
  // statement with `Condition: { Bool: { "aws:SecureTransport": "false" } }`
  // (CIS AWS — S3 bucket policies should reject HTTP). Zero-arg; targets any
  // resource with a parsed `policy` attribute (S3 bucket policies, IAM
  // policies, KMS key policies, …).
  | { readonly kind: 'requireSslOnlyPolicy' }
  | {
      readonly kind: 'listContains'
      readonly attr: AnyAttribute
      readonly values: string[]
    }
  | {
      readonly kind: 'listMustInclude'
      readonly attr: AnyAttribute
      readonly values: string[]
    }
  | {
      readonly kind: 'denyValue'
      readonly attr: AnyAttribute
      readonly values: string[]
    }
  // Allowlist: the attribute's value must be one of `values`; absent or any
  // other value is the violation (the mirror of denyValue).
  | {
      readonly kind: 'mustBeOneOf'
      readonly attr: AnyAttribute
      readonly values: string[]
    }
  | { readonly kind: 'denyPlaintextListener' }
  | { readonly kind: 'denyPrivilegedContainers' }
  // Flag ECS containers with plaintext secrets in `environment` variables —
  // an env var whose name matches a secret-like pattern (PASSWORD, SECRET,
  // KEY, TOKEN, CREDENTIAL) and whose value is a literal (not a reference).
  | { readonly kind: 'denyPlaintextEnvSecrets' }
  | { readonly kind: 'denyLiteral'; readonly attrs: AnyAttribute[] }
  // Cross-resource: this resource must be referenced by a separate resource
  // of `childType` through its `via` attribute (e.g. an S3 bucket must have a
  // matching aws_s3_bucket_server_side_encryption_configuration).
  | {
      readonly kind: 'mustHaveAssociated'
      readonly childType: AnyResource
      readonly via: AnyAttribute
    }
  // Cross-resource: flag this resource if a separate `childType` resource
  // references it via `via` (e.g. an IAM user with an inline
  // aws_iam_user_policy — managed policies are the safe pattern).
  | {
      readonly kind: 'denyIfAssociated'
      readonly childType: AnyResource
      readonly via: AnyAttribute
    }
  // Same-resource: this resource must declare a given nested block.
  | { readonly kind: 'mustHaveBlock'; readonly block: Block }
  // Same-resource: this resource must NOT declare a given nested block
  // (e.g. a GCP instance `access_config` = an ephemeral public IP).
  | { readonly kind: 'denyBlockPresence'; readonly block: Block }
  // Same-resource: flag if `lifecycle { ignore_changes = [...] }` lists any of
  // the given attribute paths — hiding drift on security-critical attrs
  // bypasses governance. `ignore_changes` entries are attribute PATHS (bare
  // identifiers hcl2json wraps as `${tags}`), not value refs, so a dedicated
  // matcher strips the interpolation wrapper.
  | { readonly kind: 'denyIgnoreChanges'; readonly attrs: string[] }
  // Same-resource: this resource must NOT declare any of the named provisioner
  // types (e.g. `local-exec`/`remote-exec`), which run arbitrary commands on
  // apply/destroy — a supply-chain / exfiltration surface.
  | { readonly kind: 'denyProvisioner'; readonly names: string[] }
  // Output-surface: an output whose `value` references a secret-bearing
  // attribute (a full `type.attr` string, name wildcarded — e.g.
  // `aws_db_instance.master_password`) must set `sensitive = true`, else it
  // leaks the secret in state / CI logs. Applies to `output` blocks, evaluated
  // in the outputs pass (not against resources).
  | {
      readonly kind: 'denyInsensitiveSecretOutput'
      readonly secretAttrs: string[]
    }
  // Binding-surface: a `variable` whose name looks like a secret (PASSWORD,
  // SECRET, KEY, TOKEN, CREDENTIAL) must set `sensitive = true`, else it leaks
  // in plans / logs. Zero-arg (built-in name pattern). Evaluated in the
  // bindings pass (not against resources).
  | { readonly kind: 'denyInsensitiveVariable' }
  // Binding-surface: a `locals` entry whose name looks like a secret AND whose
  // value is a plaintext literal (not a `${ref}`) — a hardcoded secret. The
  // safe pattern is a reference (Secrets Manager / SSM). Zero-arg. Evaluated
  // in the bindings pass.
  | { readonly kind: 'denyPlaintextLocalSecret' }
  // Settings-surface: `terraform.required_version` must be an EXACT pin
  // (`= X.Y.Z`). A floating constraint (bare `X.Y.Z`, `~>`, `>=`) lets the TF
  // engine drift → supply-chain / consistency risk. Zero-arg. Evaluated in
  // the settings pass.
  | { readonly kind: 'requireExactTerraformVersion' }
  // Settings-surface: the named providers' `required_providers` version
  // constraints must be pinned (`=` exact or `~>` pessimistic — both block a
  // major-version drift). A floating constraint (bare, `>=`, `>`) or an
  // absent provider entry is the violation. Evaluated in the settings pass.
  | { readonly kind: 'denyFloatingProviderVersion'; readonly names: string[] }
  // Settings-surface: the state backend must be declared and encrypted. Flags
  // when no backend is declared (Terraform defaults to local unencrypted state)
  // or `encrypt` is not literally true. Zero-arg. Evaluated in the settings pass.
  | { readonly kind: 'requireEncryptedBackend' }
  // Settings-surface: the state backend must NOT be `local` (or absent — which
  // Terraform treats as local). Local state is unencrypted, unshared, and not
  // locked → a catastrophic leak / corruption risk for any team. Zero-arg.
  | { readonly kind: 'denyLocalBackend' }
  // Same-resource: a `connection {}` block (used by file/remote-exec
  // provisioners) with a plaintext secret — a `private_key`/`password`/token
  // literal (not a `${ref}`). The safe pattern is a reference (Secrets Manager
  // / SSM / a file path read at runtime). Zero-arg (built-in secret-name
  // pattern, scans connection.* attributes).
  | { readonly kind: 'denyPlaintextConnectionSecret' }
  // Module-call-surface: a registry module (`source = "terraform-aws-modules/
  // vpc/aws"`) must pin its `version` (`=` or `~>` — both block a major drift).
  // A floating constraint (bare, `>=`) or absent version is the violation.
  // Local modules (`./`/`../`) carry no version and are never flagged.
  // Zero-arg. Evaluated in the module-calls pass.
  | { readonly kind: 'denyFloatingModuleVersion' }
  // Same-resource: flag if the resource's provider region is NOT in the
  // approved list (GDPR/LGPD data residency — e.g. data must stay in EU
  // regions). A resource whose region is unknown (no provider block) degrades
  // to could-not-evaluate — never a false pass.
  | { readonly kind: 'denyNonApprovedRegion'; readonly regions: string[] }
  // Project-level: at least one resource of `type` must exist anywhere in the
  // scanned project (e.g. an `aws_accessanalyzer_analyzer` for CIS 1.20, or
  // an `aws_cloudtrail` for an org that mandates one). NOT a per-resource
  // check — evaluated once in the PROJECT pass. Violations carry a synthetic
  // `<project>:0` location since absence has no resource to pin to. The
  // rule's `.environment()`/`.providerAlias()`/`.region()` filters are
  // ignored for this condition (it is about the project as a whole). Pair
  // with `.allResources()`; combine freely with per-resource conditions.
  | { readonly kind: 'requireResource'; readonly type: AnyResource }
  // v2 graph layer (doc 10): deny if this resource can reach a resource of
  // `targetType` through any chain of references. The "no DB in a public
  // subnet" rule = denyIfReachable('aws_internet_gateway'). Uses the graph's
  // bidirectional BFS (direction default 'both').
  | {
      readonly kind: 'denyIfReachable'
      readonly targetType: AnyResource
      readonly direction?: 'forward' | 'reverse' | 'both'
    }
  // v2 graph layer (doc 10): deny if this resource shares a `sharedType`
  // resource (e.g. a security group) with a resource of `otherType` (e.g.
  // a public load balancer). Lateral-movement prevention.
  | {
      readonly kind: 'denyIfSharedWith'
      readonly sharedType: AnyResource
      readonly otherType: AnyResource
    }

export interface Rule {
  readonly id: string
  readonly target: ResourceTarget
  /** If set, the rule applies only to resources in this environment. */
  readonly environment?: Environment
  /**
   * If set, the rule applies only to resources pinned to this provider alias
   * (`provider = aws.dr` → "dr"). Lets orgs scope rules to a specific account/
   * region provider without modeling the region itself. Undefined → applies to
   * every resource regardless of its provider alias.
   */
  readonly providerAlias?: string
  /** If set, the rule applies only to resources whose provider region is in
   *  this allowlist (e.g. `['eu-west-1', 'europe-west1']` for GDPR residency).
   *  A resource whose region is unknown (no provider block) degrades to
   *  could-not-evaluate — never a false pass. */
  readonly regions?: string[]
  readonly conditions: Condition[]
  readonly effect: Effect
  readonly message: string
  readonly rationale?: string
  /** For require_approval rules: who must sign off. */
  readonly approvers?: Approver[]
}

/**
 * The authored surface (doc 02). The builder IS the rule object;
 * `validate()` (called by the engine on load) returns a normalized Rule
 * on success or ACCUMULATES problems on failure (doc 06, ROP form).
 */
export class RuleBuilder {
  private _id?: string
  private _target?: ResourceTarget
  private _environment?: Environment
  private _providerAlias?: string
  private _regions?: string[]
  private _conditions: Condition[] = []
  private _effect: Effect = Effect.Block
  private _message?: string
  private _rationale?: string
  private _approvers: Approver[] = []

  resource(...types: AnyResource[]): this {
    this._target = { kind: 'resource', types }
    return this
  }

  allResources(): this {
    this._target = { kind: 'all' }
    return this
  }

  /**
   * Assign a stable, human-readable rule ID for use in ignore directives
   * and JSON output. If not set, dotzen auto-generates `rule-<N>` (positional
   * — fragile if rules are reordered). A stable ID (`no-public-ssh`) makes
   * `# dotzen:ignore no-public-ssh: <reason>` safe across reorders. Must be
   * unique within the spec and match `[a-z][a-z0-9-]*`.
   */
  id(id: string): this {
    this._id = id
    return this
  }

  environment(env: Environment): this {
    this._environment = env
    return this
  }

  /**
   * Scope the rule to resources pinned to this provider alias (`provider =
   * aws.dr` → "dr"). Lets orgs target rules at a specific account/region
   * provider (e.g. stricter controls in the dr account) without modeling the
   * region itself. A resource on the default provider (no `provider` arg) is
   * skipped by an alias-scoped rule. Like `.environment(X)`, this is a
   * fail-open filter, not a check — pair it with a condition.
   */
  providerAlias(alias: string): this {
    this._providerAlias = alias
    return this
  }

  /**
   * Scope the rule to resources in the listed provider regions (e.g.
   * `.region('eu-west-1', 'europe-west1')` for GDPR residency). A resource
   * whose region is unknown (no provider block declaring a region) degrades
   * to could-not-evaluate — never a false pass. Like `.environment(X)`, this
   * is a fail-open filter, not a check.
   */
  region(...regions: (string & {})[]): this {
    this._regions = regions
    return this
  }

  denyIngress(...ports: Port[]): this {
    this._conditions.push({
      kind: 'denyIngress',
      ports,
      from: [Cidr.Internet, Cidr.InternetV6],
    })
    return this
  }

  denyEgress(...ports: Port[]): this {
    this._conditions.push({
      kind: 'denyEgress',
      ports,
      from: [Cidr.Internet, Cidr.InternetV6],
    })
    return this
  }

  /**
   * Required tag KEYS. Accepts the built-in `Tag` enum AND org-specific
   * keys — because tag taxonomies are org-defined, unlike cloud-fixed
   * resource types/ports. Always back org keys with your OWN `enum` (never
   * bare strings) so typos stay compile errors:
   *
   *   enum OrgTag { ApmId = 'apm_id', CmdbAppId = 'cmdb_app_id' }
   *   rule().resource(...).mustHaveTags(OrgTag.ApmId, Tag.Environment)
   *
   * The `string & {}` keeps `Tag` autocomplete while allowing your enum's
   * (string-valued) members through.
   */
  mustHaveTags(...tags: (Tag | (string & {}))[]): this {
    this._conditions.push({ kind: 'mustHaveTags', tags })
    return this
  }

  mustBeTrue(...attrs: AnyAttribute[]): this {
    this._conditions.push({ kind: 'mustBeTrue', attrs })
    return this
  }

  /** AnyAttribute must be explicitly false; absent counts as a violation
   *  (use for attributes whose insecure AWS default is `true`). */
  mustBeFalse(...attrs: AnyAttribute[]): this {
    this._conditions.push({ kind: 'mustBeFalse', attrs })
    return this
  }

  /** AnyAttribute must be present (any value); absent is the violation. */
  mustBeSet(...attrs: AnyAttribute[]): this {
    this._conditions.push({ kind: 'mustBeSet', attrs })
    return this
  }

  denyWhenTrue(...attrs: AnyAttribute[]): this {
    this._conditions.push({ kind: 'denyWhenTrue', attrs })
    return this
  }

  denyAcl(...acls: Acl[]): this {
    this._conditions.push({ kind: 'denyAcl', acls })
    return this
  }

  mustEqual(attr: AnyAttribute, value: string): this {
    this._conditions.push({ kind: 'mustEqual', attr, value })
    return this
  }

  mustBeAtLeast(attr: AnyAttribute, min: number): this {
    this._conditions.push({ kind: 'mustBeAtLeast', attr, min })
    return this
  }

  /** Numeric attribute must be <= max; absent/above is the violation. */
  mustBeAtMost(attr: AnyAttribute, max: number): this {
    this._conditions.push({ kind: 'mustBeAtMost', attr, max })
    return this
  }

  /** Flag Allow statements that grant `Action: "*"` (full privileges). */
  denyIamWildcard(): this {
    this._conditions.push({ kind: 'denyIamWildcard' })
    return this
  }

  /**
   * Flag an Allow statement with `Principal: "*"` (public access). CIS AWS:
   * S3 bucket policies (and IAM policies) should not grant access to everyone.
   * Passes when no policy is present; a Deny with `Principal: "*"` is fine
   * (restrictive, not public access).
   */
  denyPublicPrincipal(): this {
    this._conditions.push({ kind: 'denyPublicPrincipal' })
    return this
  }

  /**
   * Require the resource's `policy` to deny non-SSL transport — a `Deny`
   * statement with `Condition: { Bool: { "aws:SecureTransport": "false" } }`.
   * CIS AWS: S3 bucket policies should reject HTTP. Passes when no policy is
   * present (combine with `mustHaveAssociated` to require a policy exists).
   */
  requireSslOnlyPolicy(): this {
    this._conditions.push({ kind: 'requireSslOnlyPolicy' })
    return this
  }

  /** Flag a list attribute that CONTAINS any of `values` (e.g. a public CIDR). */
  listContains(attr: AnyAttribute, ...values: string[]): this {
    this._conditions.push({ kind: 'listContains', attr, values })
    return this
  }

  /** Require a list attribute to INCLUDE all of `values` (e.g. audit log types). */
  listMustInclude(attr: AnyAttribute, ...values: string[]): this {
    this._conditions.push({ kind: 'listMustInclude', attr, values })
    return this
  }

  /** Flag a scalar attribute whose value is one of `values` (e.g. a weak TLS policy). */
  denyValue(attr: AnyAttribute, ...values: string[]): this {
    this._conditions.push({ kind: 'denyValue', attr, values })
    return this
  }

  /** Require a scalar attribute's value to be one of `values` (allowlist);
   *  absent or any other value is the violation. */
  mustBeOneOf(attr: AnyAttribute, ...values: string[]): this {
    this._conditions.push({ kind: 'mustBeOneOf', attr, values })
    return this
  }

  /** Flag a plaintext listener (HTTP/TCP) unless it redirects (default_action). */
  denyPlaintextListener(): this {
    this._conditions.push({ kind: 'denyPlaintextListener' })
    return this
  }

  /** Flag an ECS task definition with any privileged container. */
  denyPrivilegedContainers(): this {
    this._conditions.push({ kind: 'denyPrivilegedContainers' })
    return this
  }

  /**
   * Flag ECS containers with plaintext secrets in `environment` variables —
   * an env var whose name matches a secret-like pattern (PASSWORD, SECRET,
   * KEY, TOKEN, CREDENTIAL) AND whose value is a literal string (not a
   * `${var.x}` reference). CIS AWS: use Secrets Manager / SSM Parameter Store,
   * not hardcoded environment values.
   */
  denyPlaintextEnvSecrets(): this {
    this._conditions.push({ kind: 'denyPlaintextEnvSecrets' })
    return this
  }

  /** Flag a hardcoded literal where a reference is expected (e.g. a secret).
   *  A `var`/`data` reference passes; a literal value is the violation. */
  denyLiteral(...attrs: AnyAttribute[]): this {
    this._conditions.push({ kind: 'denyLiteral', attrs })
    return this
  }

  /** Require a separate `childType` resource to reference this one via `via`
   *  (e.g. an S3 bucket must have a matching server-side-encryption config). */
  mustHaveAssociated(childType: AnyResource, via: AnyAttribute): this {
    this._conditions.push({ kind: 'mustHaveAssociated', childType, via })
    return this
  }

  /** Flag this resource if a separate `childType` resource references it via
   *  `via` (e.g. an IAM user with an inline `aws_iam_user_policy` — managed
   *  policies are the preferred pattern). The inverse of
   *  `mustHaveAssociated`. */
  denyIfAssociated(childType: AnyResource, via: AnyAttribute): this {
    this._conditions.push({ kind: 'denyIfAssociated', childType, via })
    return this
  }

  /** Require this resource to declare a given nested block (e.g. EKS
   *  `encryption_config`). */
  mustHaveBlock(block: Block): this {
    this._conditions.push({ kind: 'mustHaveBlock', block })
    return this
  }

  /** Flag this resource if it declares a given nested block (e.g. a GCP
   *  instance `network_interface.access_config` = a public IP). */
  denyBlockPresence(block: Block): this {
    this._conditions.push({ kind: 'denyBlockPresence', block })
    return this
  }

  /**
   * Flag a resource whose `lifecycle { ignore_changes = [...] }` lists any of
   * the given attribute paths — hiding drift on a security-critical attribute
   * (e.g. `tags`, `encryption`) silently bypasses governance over it. Entries
   * are attribute paths (`tags`, `root_block_device.encrypted`), not value
   * refs; pass them as strings (or an org enum of governed attr paths).
   */
  denyIgnoreChanges(...attrs: (string & {})[]): this {
    this._conditions.push({ kind: 'denyIgnoreChanges', attrs })
    return this
  }

  /**
   * Flag this resource if it declares any of the named provisioner types
   * (e.g. `local-exec`/`remote-exec`). Provisioners run arbitrary commands on
   * apply/destroy — a supply-chain / exfiltration surface most orgs forbid in
   * governed modules. Pass `Provisioner.LocalExec, Provisioner.RemoteExec` to
   * deny both; a resource with no provisioners passes.
   */
  denyProvisioner(...names: (Provisioner | (string & {}))[]): this {
    this._conditions.push({ kind: 'denyProvisioner', names })
    return this
  }

  /**
   * Flag an output whose `value` references a secret-bearing attribute but
   * does not set `sensitive = true` — the secret would leak in state / CI logs.
   * Each `secretAttr` is a full `type.attr` string with the resource NAME
   * wildcarded (e.g. `aws_db_instance.master_password`,
   * `aws_secretsmanager_secret_version.secret_string`). Applies to `output`
   * blocks; use with `.allResources()` (output rules target every output).
   * A `sensitive = true` output passes; an output referencing no secret passes;
   * a `sensitive` flag that is itself an unresolvable var degrades to
   * could-not-evaluate rather than a guess.
   */
  denyInsensitiveSecretOutput(...secretAttrs: (string & {})[]): this {
    this._conditions.push({ kind: 'denyInsensitiveSecretOutput', secretAttrs })
    return this
  }

  /**
   * Flag a `variable` whose name looks like a secret (PASSWORD, SECRET, KEY,
   * TOKEN, CREDENTIAL) but does not set `sensitive = true` — its value leaks
   * in plans / CI logs. Terraform's own guidance: mark secret variables
   * sensitive. Zero-arg (built-in name pattern); use with `.allResources()`
   * (binding rules target every variable). A `sensitive = true` variable
   * passes; a `sensitive` flag that is itself an unresolvable var degrades to
   * could-not-evaluate.
   *
   * **Config-flag precision:** a variable is SKIPPED (not flagged) when its
   * name contains a secret word but it is clearly a configuration parameter,
   * not a secret value: (1) `type = bool` or `type = number` (a secret is
   * always a string); (2) a verb prefix (`allow_*`, `create_*`, `attach_*`,
   * `enable_*`, `disable_*`); (3) a config-flag suffix (`_enabled`,
   * `_disabled`, `_policy`, `_arns`, `_age`, `_length`, `_required`, etc.).
   * A `string`-typed variable (e.g. `db_password`) is still flagged.
   */
  denyInsensitiveVariable(): this {
    this._conditions.push({ kind: 'denyInsensitiveVariable' })
    return this
  }

  /**
   * Flag a `locals` entry whose name looks like a secret (PASSWORD, SECRET,
   * KEY, TOKEN, CREDENTIAL) AND whose value is a plaintext literal — a
   * hardcoded secret. The safe pattern is a reference (Secrets Manager / SSM
   * Parameter Store / Key Vault). Zero-arg; use with `.allResources()`.
   */
  denyPlaintextLocalSecret(): this {
    this._conditions.push({ kind: 'denyPlaintextLocalSecret' })
    return this
  }

  /**
   * Require `terraform.required_version` to be an EXACT pin (`= X.Y.Z`).
   * Flags when it is absent or uses a floating constraint (bare `X.Y.Z`,
   * `~>`, `>=`, …) — the TF engine would drift on `terraform init`. Zero-arg;
   * use with `.allResources()` (settings rules target the terraform block).
   */
  requireExactTerraformVersion(): this {
    this._conditions.push({ kind: 'requireExactTerraformVersion' })
    return this
  }

  /**
   * Flag the named providers whose `required_providers` version constraint is
   * floating (bare, `>=`, `>`) or absent. `=` (exact) and `~>` (pessimistic —
   * blocks a major bump) pass. An absent provider entry is a violation (the
   * provider is not pinned at all). Pass provider names as strings (e.g.
   * `'aws'`, `'google'`) — they're the keys under `required_providers`.
   */
  denyFloatingProviderVersion(...names: (string & {})[]): this {
    this._conditions.push({ kind: 'denyFloatingProviderVersion', names })
    return this
  }

  /**
   * Require the state backend to be encrypted (`encrypt = true`) WHEN one is
   * declared. Absence of a backend is a PASS (not a violation) — a module
   * repo intentionally declares no backend (the backend is the env/layer
   * consumer's concern); the "must declare a backend" concern is
   * `denyLocalBackend`'s job. Fires on a declared backend whose `encrypt`
   * is not literally true (including `local`, which has no encrypt concept).
   * An `encrypt` that is itself a var ref degrades to could-not-evaluate.
   * Zero-arg; use with `.allResources()`.
   */
  requireEncryptedBackend(): this {
    this._conditions.push({ kind: 'requireEncryptedBackend' })
    return this
  }

  /**
   * Forbid a `local` backend (or no backend — Terraform defaults to local).
   * Local state is unencrypted, unshared, and unlocked — a catastrophic
   * leak / corruption risk for any team. Use to enforce remote state. Zero-arg.
   */
  denyLocalBackend(): this {
    this._conditions.push({ kind: 'denyLocalBackend' })
    return this
  }

  /**
   * Flag a `connection {}` block (used by `file`/`remote-exec` provisioners)
   * that hardcodes a secret — a `private_key`/`password`/`token`/`credential`
   * literal string (not a `${ref}`). The safe pattern is a reference (Secrets
   * Manager / SSM Parameter Store) or a file read at runtime. Zero-arg
   * (built-in secret-name pattern); scans the `connection.*` nested-block
   * attributes the parser flattens.
   */
  denyPlaintextConnectionSecret(): this {
    this._conditions.push({ kind: 'denyPlaintextConnectionSecret' })
    return this
  }

  /**
   * Flag a REGISTRY module (`source = "terraform-aws-modules/vpc/aws"`) whose
   * `version` constraint is floating (bare, `>=`) or absent — `terraform init`
   * would pull a different revision on each run (supply-chain drift). `=`
   * (exact) and `~>` (pessimistic) pass. Local modules (`./`/`../`) carry no
   * version and are never flagged. Zero-arg; use with `.allResources()`.
   */
  denyFloatingModuleVersion(): this {
    this._conditions.push({ kind: 'denyFloatingModuleVersion' })
    return this
  }

  /**
   * Flag a resource whose provider region is NOT in the approved list — a
   * GDPR/LGPD data-residency control (e.g. personal data must stay in EU
   * regions). Pass region strings (e.g. `'eu-west-1'`, `'europe-west1'`). A
   * resource whose region is unknown (no provider block declaring a region)
   * degrades to could-not-evaluate — never a false pass. Use with
   * `.allResources()` or `.resource(...)`.
   */
  denyNonApprovedRegion(...regions: (string & {})[]): this {
    this._conditions.push({ kind: 'denyNonApprovedRegion', regions })
    return this
  }

  /**
   * Require at least one resource of `type` to exist anywhere in the
   * scanned project — a project-level presence check (CIS AWS 1.20 "ensure
   * Access Analyzer is enabled" is the canonical case: an
   * `aws_accessanalyzer_analyzer` must be declared). NOT a per-resource
   * check; it runs once in the PROJECT pass. Violations carry a synthetic
   * `<project>:0` location (absence has no resource to pin to). Use with
   * `.allResources()`; the rule's `.environment()`/`.providerAlias()`/
   * `.region()` filters are ignored for this condition. Combine freely with
   * per-resource conditions on the same rule (each is evaluated in its own
   * pass). Pass a data-source type to require a data source instead.
   */
  requireResource(type: AnyResource): this {
    this._conditions.push({ kind: 'requireResource', type })
    return this
  }

  /** v2 graph layer (doc 10): deny if this resource can reach a resource of
   *  `targetType` through any chain of references (bidirectional BFS).
   *  The "no DB in a public subnet" rule = `.denyIfReachable(AwsResource.InternetGateway)`.
   *  `direction` defaults to 'both' (forward + reverse traversal). */
  denyIfReachable(
    targetType: AnyResource,
    direction?: 'forward' | 'reverse' | 'both',
  ): this {
    this._conditions.push({ kind: 'denyIfReachable', targetType, direction })
    return this
  }

  /** v2 graph layer (doc 10): deny if this resource shares a `sharedType`
   *  (e.g. a security group) with a resource of `otherType` (e.g. a public
   *  load balancer). Lateral-movement prevention — isolates trust boundaries. */
  denyIfSharedWith(sharedType: AnyResource, otherType: AnyResource): this {
    this._conditions.push({ kind: 'denyIfSharedWith', sharedType, otherType })
    return this
  }

  onViolation(effect: Effect): this {
    this._effect = effect
    return this
  }

  approvers(...names: Approver[]): this {
    this._approvers = names
    return this
  }

  message(msg: string): this {
    this._message = msg
    return this
  }

  rationale(text: string): this {
    this._rationale = text
    return this
  }

  validate(index: number): Result<Rule, RuleValidationError[]> {
    const problems: RuleValidationError[] = []
    const fail = (problem: string) =>
      problems.push({ ruleIndex: index, problem })

    const hasTarget =
      this._target &&
      (this._target.kind === 'all' || this._target.types.length > 0)
    if (!this._message) fail('missing .message()')
    if (!hasTarget) fail('missing .resource() or .allResources()')
    if (this._conditions.length === 0) fail('no conditions')

    // Validate author-chosen ID format if set.
    const STABLE_ID_RE = /^[a-z][a-z0-9-]*$/
    const authorId = this._id
    if (authorId && !STABLE_ID_RE.test(authorId))
      fail(`.id() must match [a-z][a-z0-9-]* (got "${authorId}")`)

    if (problems.length > 0) return err(problems)

    return ok({
      id: authorId ?? `rule-${index + 1}`,
      target: this._target!,
      environment: this._environment,
      providerAlias: this._providerAlias,
      regions: this._regions,
      conditions: this._conditions,
      effect: this._effect,
      message: this._message!,
      rationale: this._rationale,
      approvers: this._approvers.length > 0 ? this._approvers : undefined,
    })
  }
}

export const rule = (): RuleBuilder => new RuleBuilder()
