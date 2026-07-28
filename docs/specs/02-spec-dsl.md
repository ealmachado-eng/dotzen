# 02 — Spec DSL Specification

This document defines `.zen/spec.ts`: the file a platform team writes
and a security architect reads. It is the single most important
artifact in the product — see `/docs/specs/01-product-overview.md`
§"Prose as Code" for why.

## Design rule: no bare strings for domain values

Every domain concept — resource type, port, effect, tag key, region,
environment, instance class, ACL — is a TypeScript `const enum`. This is
not a style preference; it is the mechanism that makes typos into
compile errors instead of silent governance gaps.

```typescript
// WRONG — every one of these compiles and silently does nothing useful
resource('aws_secuirty_groop')     // typo, never matches anything
port: 2222                          // wrong port, rule never fires
onViolation: 'blokc'                // typo, effect is undefined
mustHaveTags: ['team', 'cost_cneter']

// RIGHT — every one of these is a compile-time error if wrong
resource(AwsResource.SecurityGroup)
denyIngress(Port.SSH)
onViolation(Effect.Block)
mustHaveTags(Tag.Team, Tag.CostCenter)
```

## The layered type-safety model — and which layers v1 actually needs

Six increasingly strong layers of safety were designed. **Do not
implement all six for v1.** Add a layer only when the specific failure
it prevents has actually happened or is clearly imminent. This section
exists precisely to stop over-engineering.

| Layer | What it is | Cost | v1? |
|---|---|---|---|
| 1. `const enum`s | Closed vocabulary for every domain value | ~50 lines, defined once | **Yes — always** |
| 2. Branded types | Prevents mixing incompatible string-typed values (e.g. a `CidrBlock` used where a `TagValue` is expected) | More complex type defs, constructor functions | No — add only if type-confusion bugs actually occur |
| 3. Discriminated unions for `Resource` | Lets TypeScript narrow resource attributes per-branch in the engine's evaluation logic | ~40 lines | Optional — nice to have in the engine, not required for the spec DSL surface |
| 4. `ts-pattern` `.exhaustive()` | Missing-resource-case-handling becomes a **compile error** in the engine (the same exhaustiveness guarantee that sealed-type matching gives in compiled languages) | `npm install ts-pattern`, rewrite evaluation as `match()` chains | **Yes, but only in the engine's internal evaluation code — never in the spec DSL surface itself.** High value for correctness as the resource vocabulary grows. |
| 5. Zod runtime validation | Catches invalid values arriving from *external* sources (a spec fetched from a registry/API, not authored locally in TypeScript) | `npm install zod`, define schemas | No — not needed until there is a spec-fetching mechanism (v2+, see `/docs/specs/05-future-cloud-layer.md`) |
| 6. `RuleBuilder.build()`/getter validation | Catches incomplete rules (missing `.message()`, missing resource target, zero conditions) at spec-load time | ~10 lines | **Yes — always. Trivial cost, catches real authoring mistakes.** |

**v1 minimum: Layers 1 and 6.** **v1-solid (recommended once there's a
real team using it): add Layer 4 in the engine only.** Everything else
waits for a concrete trigger.

## The `.build()` question — resolved

Earlier iterations of this DSL required an explicit `.build()` call at
the end of every rule (`rule().resource(...).message(...).build()`).
**This has been removed.** The `RuleBuilder` itself is the rule object;
validation happens once, at spec-load time, via a `validate()` method
the engine calls on every rule when it loads `spec.ts` — not per-rule
authoring ceremony. This makes the spec read as pure declarations:

```typescript
export const spec = [
  rule()
    .resource(AwsResource.SecurityGroup)
    .denyIngress(Port.SSH, Port.RDP)
    .message('SSH and RDP must not be open to internet'),

  rule()
    .resource(AwsResource.DbInstance)
    .mustHaveTags(Tag.Team, Tag.CostCenter, Tag.Environment)
    .message('Required tags missing'),
]
```

No `.build()`. No trailing ceremony. This is the canonical style — do
not reintroduce `.build()`.

## Canonical vocabulary (v1 starter set)

Extend this table as new resource types/conditions are needed, but
always by adding an enum member — never a bare string — and always in
one place, letting the TypeScript compiler (and, if Layer 4 is in use,
`ts-pattern .exhaustive()`) surface everywhere else that needs updating.

```typescript
// Per-provider modules (see "Multi-provider vocabulary namespacing" below).
// AWS members drop the provider prefix — the enum name already carries it
// (AwsResource.SecurityGroup, mirroring AzureResource.StorageAccount).
enum AwsResource {
  SecurityGroup = 'aws_security_group',
  DbInstance    = 'aws_db_instance',
  S3Bucket      = 'aws_s3_bucket',
  Instance      = 'aws_instance',
}

const enum Port {
  SSH      = 22,
  RDP      = 3389,
  Postgres = 5432,
  MySQL    = 3306,
  Redis    = 6379,
  MongoDB  = 27017,
}

const enum Cidr {
  Internet   = '0.0.0.0/0',
  InternetV6 = '::/0',
}

const enum Effect {
  Block           = 'block',
  Warn            = 'warn',
  RequireApproval = 'require_approval',
}

const enum Environment {
  Development = 'development',
  Staging     = 'staging',
  Production  = 'production',
}

// AWS attributes (Azure/GCP attribute names live in their own modules).
enum AwsAttribute {
  StorageEncrypted      = 'storage_encrypted',
  PubliclyAccessible    = 'publicly_accessible',
  ServerSideEncryption  = 'server_side_encryption',
  HttpsOnly             = 'https_only',
  MultiAz               = 'multi_az',
  DeletionProtection    = 'deletion_protection',
}

const enum Acl {
  Private         = 'private',
  PublicRead      = 'public-read',
  PublicReadWrite = 'public-read-write',
}

const enum Tag {
  Team               = 'team',
  CostCenter         = 'cost_center',
  Environment        = 'environment',
  DataClassification = 'data_classification',
}

const enum Region {
  Brazil  = 'sa-east-1',
  USEast1 = 'us-east-1',
}

// Org-defined approval groups/roles — enum-backed like every other domain
// value (a typo'd approver would silently misroute an approval gate).
const enum Approver {
  PlatformTeam      = 'platform-team',
  SecurityArchitect = 'security-architect',
  FinOps            = 'finops',
  SRE               = 'sre',
}
```

> **Implementation note (v0 slice).** The engine uses regular `enum`, not
> `const enum`. `const enum` cannot be inlined across files by the
> esbuild/Vitest transpiler under `isolatedModules`, and it fights the
> toolchain for zero real benefit here — regular `enum` gives the
> *identical* typo-safety (a misspelled member is a compile error); only
> cross-file inlining (a micro-optimization irrelevant to a CLI that runs
> for milliseconds) differs. This is a deliberate, documented deviation,
> not a regression of the "no bare strings" rule, which still holds fully.

## Multi-provider vocabulary namespacing (decided, implemented)

Earlier sketches of this doc jammed AWS and Azure resource types into a
single enum. That was **superseded** once real Azure coverage landed: each
cloud provider gets its own vocabulary module — `vocabulary/aws.ts`
(`AwsResource` / `AwsAttribute`), `vocabulary/azure.ts` (`AzureResource` /
`AzureAttribute`), later `vocabulary/gcp.ts` — rather than one ever-growing
enum. AWS members also drop their old `Aws` prefix (the enum name carries
it): `AwsResource.SecurityGroup`, mirroring `AzureResource.StorageAccount`.

Why: a single enum mixing three clouds becomes a hundred-member soup that
undermines the "Prose as Code" readability goal (autocomplete stops
guiding, and a rule no longer reads in one cloud's idiom). Per-provider
modules keep each cloud's `spec.ts` clean: `AzureResource.StorageAccount`,
not `AwsResource.AzurermStorageAccount` buried among AWS members.

The cloud-neutral engine accepts every provider via two shared unions:

```typescript
export type AnyResource = AwsResource | AzureResource // | GcpResource ...
export type AnyAttribute = AwsAttribute | AzureAttribute  // | GcpAttribute ...
```

`NormalizedResource.type`, `ResourceTarget.types`, and every `RuleBuilder`
attribute parameter are typed as these unions, so **conditions and the
pipeline are written once and reused across clouds**. Adding a provider is:
(1) a new vocabulary module, (2) add it to the unions + `KNOWN_TYPES`,
(3) provider-specific `normalize` mapping *only* for structures that don't
flatten generically (network security rules, mainly — booleans, scalars,
tags, and secret attributes all reuse the generic extractor untouched).
The "no bare strings / one place to edit" rule holds per module.

## `RuleBuilder` reference implementation (v1 minimum: Layers 1 + 6)

```typescript
class RuleBuilder {
  private _resource: AwsResource[] = []
  private _allResources = false
  private _ports: Port[] = []
  private _tags: Tag[] = []
  private _mustHaveAttrs: AwsAttribute[] = []
  private _denyAcls: Acl[] = []
  private _environment?: Environment
  private _effect: Effect = Effect.Block
  private _message?: string
  private _rationale?: string
  private _approvers: Approver[] = []

  resource(...types: AwsResource[]): this {
    // Accepts one OR MANY types, so a single rule can target a set —
    // e.g. `.resource(AwsSecurityGroup, AwsDbInstance, AwsS3Bucket)` for a
    // tag policy scoped to taggable types. Prefer this over `.allResources()`
    // for tag rules, so decomposed sub-resources (aws_s3_bucket_acl,
    // aws_vpc_security_group_ingress_rule) that carry no meaningful tags are
    // not spuriously flagged.
    this._resource = types
    return this
  }

  allResources(): this {
    this._allResources = true
    return this
  }

  denyIngress(...ports: Port[]): this {
    this._ports = ports
    return this
  }

  mustHave(...attrs: AwsAttribute[]): this {
    this._mustHaveAttrs = attrs
    return this
  }

  mustHaveTags(...tags: Tag[]): this {
    this._tags = tags
    return this
  }

  denyAcl(...acls: Acl[]): this {
    this._denyAcls = acls
    return this
  }

  environment(env: Environment): this {
    this._environment = env
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

  onViolation(effect: Effect): this {
    this._effect = effect
    return this
  }

  approvers(...names: Approver[]): this {
    this._approvers = names
    return this
  }

  /** Called by the engine on spec load — not by the spec author. */
  validate(): void {
    if (!this._message) {
      throw new Error('Rule must have a .message()')
    }
    if (this._resource.length === 0 && !this._allResources) {
      throw new Error('Rule must specify .resource(...) or .allResources()')
    }
    const hasCondition =
      this._ports.length > 0 ||
      this._tags.length > 0 ||
      this._mustHaveAttrs.length > 0 ||
      this._denyAcls.length > 0
    if (!hasCondition) {
      throw new Error('Rule must have at least one condition')
    }
  }
}

const rule = () => new RuleBuilder()
```

Engine spec-loading enforces validation with a clear per-rule error:

```typescript
function loadSpec(rules: RuleBuilder[]): RuleBuilder[] {
  rules.forEach((r, i) => {
    try {
      r.validate()
    } catch (err) {
      throw new Error(`Rule ${i + 1}: ${(err as Error).message}`)
    }
  })
  return rules
}
```

> **Implementation note (v0 slice).** The engine refines `validate()` into
> ROP form: it returns `Result<Rule, RuleValidationError[]>` and
> **accumulates** every problem for a rule rather than throwing on the
> first, and `loadSpec` folds those with `combineWithAllErrors` so an
> invalid spec reports every bad rule at once. The throwing version above
> is illustrative; see `/docs/specs/06-engine-architecture.md` §"Spec
> loading" and the ROP rules for the actual contract.

## Worked example: a realistic starter spec

```typescript
// .zen/spec.ts
export const spec = [

  // ── Networking ──────────────────────────────────────
  rule()
    .resource(AwsResource.SecurityGroup)
    .denyIngress(Port.SSH, Port.RDP)
    .message('SSH and RDP must not be open to internet')
    .rationale(
      'Direct SSH/RDP from 0.0.0.0/0 exposes instances to brute-force ' +
      'attacks. Use SSM Session Manager instead. CIS AWS Benchmark 5.2.'
    ),

  rule()
    .resource(AwsResource.SecurityGroup)
    .environment(Environment.Production)
    .denyIngress(Port.Postgres, Port.MySQL, Port.Redis)
    .message('Database ports must not be open to internet'),

  // ── Encryption ───────────────────────────────────────
  rule()
    .resource(AwsResource.DbInstance)
    .mustHave(AwsAttribute.StorageEncrypted, AwsAttribute.DeletionProtection)
    .message('RDS requires encryption at rest and deletion protection'),

  rule()
    .resource(AwsResource.S3Bucket)
    .mustHave(AwsAttribute.ServerSideEncryption)
    .message('S3 buckets require server-side encryption'),

  // ── Tagging ──────────────────────────────────────────
  rule()
    .allResources()
    .mustHaveTags(Tag.Team, Tag.CostCenter, Tag.Environment)
    .message('Required tags missing: team, cost_center, environment'),

  // ── Public access ────────────────────────────────────
  rule()
    .resource(AwsResource.S3Bucket)
    .denyAcl(Acl.PublicRead, Acl.PublicReadWrite)
    .message('S3 buckets must not have public ACLs'),

  rule()
    .resource(AwsResource.DbInstance)
    .mustHave(AwsAttribute.PubliclyAccessible) // see note below
    .message('RDS instances must not be publicly accessible'),

  // ── Production gates ─────────────────────────────────
  rule()
    .resource(AwsResource.DbInstance)
    .environment(Environment.Production)
    .onViolation(Effect.RequireApproval)
    .approvers(Approver.PlatformTeam, Approver.FinOps)
    .message('Large DB instance in production requires approval'),

]
```

> Note: "must NOT have attribute X = true" (deny-when-true) vs. "must
> have attribute X = true" (require-true) are semantically different
> conditions that the v1 `RuleBuilder` above conflates for brevity. When
> implementing, add a distinct `.denyWhenTrue(AwsAttribute)` /
> `.mustBeTrue(AwsAttribute)` pair rather than overloading `.mustHave()` —
> this table is illustrative of vocabulary, not a literal API contract
> to copy verbatim.

## Style rule: prose-readability check

Before merging any change to a shared `spec.ts`, apply this test: **read
the rule aloud, replacing method calls with plain words.** If it does
not read as a sentence a non-programmer would understand, the rule or
the vocabulary needs to change — not the reader's expectations.

```
.resource(AwsResource.SecurityGroup)
.denyIngress(Port.SSH, Port.RDP)
.message('...')

  reads as: "For AWS security groups, deny ingress on SSH and RDP."
  passes.
```

## Implementation reality: the matching is the hard part

The DSL vocabulary above is the easy ~10% of the engine. The other ~90%
is faithfully matching rules against real HCL: resolving nested and
`dynamic` blocks, `for_each` / `count` expansion, `var` / `local`
references, `.tfvars`, and multi-file modules — while static analysis
deliberately does *not* resolve values that would require a
`terraform plan` (see `/docs/specs/03-distribution-and-cli.md`
§"Static analysis vs `terraform plan`"). Two consequences for whoever
builds the engine:

- Do not treat rule evaluation as a solved detail. Build the matcher
  against real AI-generated `.tf` fixtures and grow it case-by-case;
  the DSL surface is nearly done before the matcher has started.
- Keep the engine honest about what static matching can and cannot see.
  A rule that silently never fires because it could not resolve a
  variable is worse than no rule — surface "could not evaluate" as a
  distinct, visible outcome, never as a silent pass.

> **v0 slice — environment scoping is a filter.** `.environment(X)` makes
> a rule apply only to resources whose `environment` **tag** resolves to
> `X` (the standard convention; `var`/`local` in the tag value are
> resolved first). It is a scope filter, not a check: a resource whose
> environment is a different value, absent, or unresolved is simply
> skipped by that rule — *not* a pass and *not* a violation. This is
> fail-open by design, so pair env-scoped rules with a
> `mustHaveTags(Tag.Environment)` rule to force every resource to declare
> its environment (defense in depth, see `/docs/specs/04-governance-model.md`).

> **v0 slice — the boolean-attribute conditions are implemented as
> prescribed.** `.mustBeTrue(AwsAttribute)`, `.mustBeFalse(AwsAttribute)`, and
> `.denyWhenTrue(AwsAttribute)` are distinct conditions (not an overloaded
> `.mustHave()`). `mustBeTrue`/`denyWhenTrue` treat an **absent** attribute
> as *not-true* (matching the AWS default of `false`, e.g.
> `storage_encrypted`); an unresolved value degrades to "could not
> evaluate." **`mustBeFalse` is the mirror for attributes whose insecure
> default is `true`** — absent counts as a *violation* (never a silent
> pass), which is why EKS `vpc_config.endpoint_public_access` is flagged
> even when omitted. Validated on RDS, EBS/EFS/KMS, DynamoDB/ECR, ALB, and
> EKS in the example corpus.

> **v0 slice — value-equality and numeric-threshold conditions, plus
> nested-block attributes.** `.mustEqual(attr, value)` (string equality;
> absent ⇒ violation) and `.mustBeAtLeast(attr, min)` (numeric floor) are
> implemented. Attributes may address one level of **nested block** via a
> dotted key — `normalize` flattens `metadata_options { http_tokens = X }`
> to the attribute `metadata_options.http_tokens`. Together these deliver
> EC2 **IMDSv2** (`.mustEqual(AwsAttribute.HttpTokens, HttpTokens.Required)`
> — the value is enum-backed to preserve typo-safety), DynamoDB/ECR nested
> encryption/scan booleans (via `mustBeTrue`), and RDS
> `backup_retention_period >= 7`. Thresholds take a plain number (a tuning
> parameter, not closed vocabulary).

> **v0 slice — IAM over-permission (`denyIamWildcard`).** Flags IAM
> `Allow` statements granting full `Action: "*"` (the highest-impact
> AI-generated mistake). It parses the `policy` argument when it is a
> **literal JSON document** (heredoc / inline string) — the "literal &
> explicit" pattern from doc 01. A `jsonencode(...)` expression, a
> variable, or malformed JSON is reported as **"could not evaluate"**, not
> guessed — dotzen never text-scans an expression it can't parse. Still
> open: parsing the object argument of `jsonencode(...)`,
> `data.aws_iam_policy_document` statement blocks, and `Resource`/service
> (`s3:*`) wildcards (only full `Action: "*"` is flagged today).

> **v0 slice — `mustHaveTags` is also implemented.** A resource with a
> literal `tags` map is checked for the required keys; an absent `tags`
> block is a violation (nothing present); a `${...}` tags expression
> (`var`/`merge`/`local`) degrades to "could not evaluate." It applies to
> any resource via `.allResources()`. Condition dispatch in the engine is
> exhaustive, so adding a third condition kind is a compile error until
> every evaluator handles it (Layer 4).

> **v0 slice — what `denyIngress` matching covers today.** Validated
> against representative AI output (see doc 01 §"Measured"): (a) inline
> `ingress { ... }` blocks; (b) `dynamic "ingress"` blocks — **expanded**:
> when the `for_each` resolves (via scope) to a concrete list/map, the
> block is iterated into concrete ingress rules with `<iterator>.value`
> references substituted; when it cannot be resolved, the values remain
> "could not evaluate" rather than a silent pass; (c) the standalone
> `aws_vpc_security_group_ingress_rule` resource, treated as a decomposed
> form of security-group ingress; and (d) **`var`/`local` resolution** —
> a value that is a sole `${var.x}` / `${local.y}` reference is resolved
> to its literal (through local→var chains, **across files** — `parseTf`
> builds one scope over the whole directory) so it produces a definite
> verdict instead of "could not evaluate". **Still open** (documented, not
> yet built): compound interpolations (`"a-${var.x}"`), `.tfvars`,
> **resource-level** `count`/`for_each`, function-wrapped collections
> (`toset(...)`), `each.*`, and module-input resolution — all of which
> correctly remain "could not evaluate" when they would affect a result.

> **v1.4–v1.6 — conservative ternary evaluator.** The engine resolves the
> common AI-generated pattern `local.is_prod = var.env == "prd"` followed
> by `${local.is_prod ? true : false}`. Three forms are handled:
> (1) inline compare `${ref (==|!=) scalar ? scalar : scalar}` (the
> original #16 path); (2) bare-ref condition `${local.is_prod ? a : b}`
> where the local stores a comparison interpolation (resolved via
> `tryEvalComparison`); (3) ref branches — the chosen branch may be a
> sole `var`/`local` ref, resolved through scope via `resolveValue`.
> Compound branches (arithmetic, function calls) stay unresolved. Ref
> chains (var→local→literal) resolve through depth-bounded recursion.
> Non-boolean literals as ternary conditions (strings/numbers) are
> refused — Terraform forbids them.

> **v1.4–v1.6 — `denyIfAssociated` condition.** The inverse of
> `mustHaveAssociated`. Flags a resource if a separate `childType`
> resource references it via the `via` attribute. Uses the same
> association index as `mustHaveAssociated` (zero additional cost).
> Example: an IAM user with an inline `aws_iam_user_policy` — managed
> policies are the preferred pattern.
> ```typescript
> rule()
>   .resource(AwsResource.IamUser)
>   .denyIfAssociated(AwsResource.IamUserPolicy, AwsAttribute.User)
>   .onViolation(Effect.Warn)
>   .message('IAM users must not have inline policies')
> ```

> **v1.4–v1.6 — `UTILITY_TYPES` silently-skipped set.** Terraform
> built-in utility resources (`random_password`, `random_string`,
> `random_id`, `random_uuid`, `random_shuffle`, `random_pet`,
> `random_integer`, `random_bytes`, `terraform_data`, `null_resource`,
> `time_sleep`, `tls_private_key`, `tls_self_signed_cert`,
> `tls_locally_signed_cert`) are silently skipped in
> `collectUngoverned` — neither governed nor surfaced as a coverage
> gap. These resources have no security surface; reporting them as
> ungoverned was noise on real module repos.

> **v1.4–v1.6 — vocabulary expansion + verification.** The closed
> vocabulary grew from 83 to 1003 resource types across AWS (484),
> Azure (302), and GCP (201), plus 22 data source types. All values
> verified against the actual HashiCorp Terraform provider documentation
> (AWS 100%, GCP 100%, Azure 84% — 52 deprecated-but-real types kept
> based on Go source verification). AWS enums extracted to
> `vocabulary/aws.ts` (mirrors the `azure.ts`/`gcp.ts`/`data.ts` pattern);
> `index.ts` halved from 325 → 166 lines, keeping only cross-cloud
> enums. Adding a provider is one new sibling module + one arm per
> union.

> **v1.5 — `denyInsensitiveVariable` config-flag skip.** Variables
> whose name contains a secret-like word (PASSWORD, SECRET, KEY, TOKEN)
> but ends with a config-flag suffix (`_enabled`, `_disabled`,
> `_interval`, `_timeout`, `_count`, `_mode`, `_provider`, `_addon`,
> `_via_dns`, `_max_length`, `_min_length`) are skipped — these are
> feature flags, not secrets (e.g. `secret_rotation_enabled`). Only
> `denyInsensitiveVariable` is affected; `denyPlaintextLocalSecret`
> still flags a local named `secret_rotation_enabled = "hunter2"`.

> **v1.6 — `denyIamWildcard` + `denyPublicPrincipal` broadened.** These
> conditions now target `aws_iam_policy`, `aws_iam_role_policy`, AND
> `aws_iam_user_policy` (was only `aws_iam_policy`). Wildcard inline
> policies (`Action: "*"` on an `aws_iam_role_policy`) no longer escape
> the check.

## Deferred (documented for continuity, not v1 work)

- `ts-pattern` exhaustive matching in the **engine** (Layer 4) — do this
  once the resource vocabulary is non-trivial (roughly: once there are
  more than ~5 resource types and more than one contributor to the
  engine code).
- Branded types (Layer 2), discriminated union resource modeling
  (Layer 3), Zod runtime validation (Layer 5) — see table above for
  trigger conditions.
- ~~A `dotzen init` command that scaffolds `.zen/spec.ts`~~ **Implemented
  in v0.** `dotzen init [dir]` scaffolds `dotzen.json` (version-pinned),
  `.zen/spec.ts` (real `@dotzen/dotzen` import + an AWS baseline rule
  set), refusing to overwrite existing files. It **auto-detects existing
  Terraform** and points `dotzen.json`'s `terraform` at it: every
  directory containing `.tf` *directly* is a root — one root → a string
  (`"."` / `"./infra"`), several (e.g. `env/{dev,stg,prd}`) → an **array**
  (each evaluated with its own scope), mapping recognizable env folder
  names to a declared `environment` (`{ path, environment }`) so
  `.environment(X)` scoping works by folder; greenfield → `"./terraform"`,
  which is created. `--terraform <path>` overrides detection. **The
  environment mapping is a best-effort guess the author is expected to
  review and edit** — e.g. map staging to `production` to hold it to the
  same rules (see `/docs/specs/03-distribution-and-cli.md`). Provider auto-detection of the *rule baseline*
  (AWS/Azure/GCP) remains a future enhancement; the v0 scaffold is
  AWS-only.
