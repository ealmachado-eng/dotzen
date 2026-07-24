import { Rule, Condition, ResourceTarget } from '../spec/rule'
import {
  NormalizedResource,
  IngressRule,
  NormalizedValue,
  address,
} from '../hcl/model'
import { Effect, AwsResource, Port, Cidr } from '../vocabulary'

export interface Violation {
  readonly ruleId: string
  readonly message: string
  readonly rationale?: string
  readonly effect: Effect
  readonly resource: string
  readonly file: string
  readonly line: number
  readonly approvers?: string[]
}

export interface Unevaluable {
  readonly ruleId: string
  readonly resource: string
  readonly file: string
  readonly line: number
  readonly reason: string
}

/** Success-track payload with THREE outcomes (doc 06, Rule 2). */
export interface CheckReport {
  readonly violations: Violation[]
  readonly passed: number
  readonly couldNotEvaluate: Unevaluable[]
}

type ConditionOutcome =
  | { kind: 'pass' }
  | { kind: 'violation'; detail: string }
  | { kind: 'cannotEvaluate'; reason: string }

type DenyIngress = Extract<Condition, { kind: 'denyIngress' }>
type DenyEgress = Extract<Condition, { kind: 'denyEgress' }>
type MustHaveTags = Extract<Condition, { kind: 'mustHaveTags' }>
type MustBeTrue = Extract<Condition, { kind: 'mustBeTrue' }>
type MustBeFalse = Extract<Condition, { kind: 'mustBeFalse' }>
type MustBeSet = Extract<Condition, { kind: 'mustBeSet' }>
type DenyWhenTrue = Extract<Condition, { kind: 'denyWhenTrue' }>
type DenyAcl = Extract<Condition, { kind: 'denyAcl' }>
type MustEqual = Extract<Condition, { kind: 'mustEqual' }>
type MustBeAtLeast = Extract<Condition, { kind: 'mustBeAtLeast' }>
type MustBeAtMost = Extract<Condition, { kind: 'mustBeAtMost' }>
type DenyIamWildcard = Extract<Condition, { kind: 'denyIamWildcard' }>
type DenyPublicPrincipal = Extract<Condition, { kind: 'denyPublicPrincipal' }>
type RequireSslOnlyPolicy = Extract<Condition, { kind: 'requireSslOnlyPolicy' }>
type ListContains = Extract<Condition, { kind: 'listContains' }>
type ListMustInclude = Extract<Condition, { kind: 'listMustInclude' }>
type DenyValue = Extract<Condition, { kind: 'denyValue' }>
type MustBeOneOf = Extract<Condition, { kind: 'mustBeOneOf' }>
type DenyPlaintextListener = Extract<
  Condition,
  { kind: 'denyPlaintextListener' }
>
type DenyPrivilegedContainers = Extract<
  Condition,
  { kind: 'denyPrivilegedContainers' }
>
type DenyPlaintextEnvSecrets = Extract<
  Condition,
  { kind: 'denyPlaintextEnvSecrets' }
>
type DenyLiteral = Extract<Condition, { kind: 'denyLiteral' }>
type MustHaveAssociated = Extract<Condition, { kind: 'mustHaveAssociated' }>
type MustHaveBlock = Extract<Condition, { kind: 'mustHaveBlock' }>
type DenyBlockPresence = Extract<Condition, { kind: 'denyBlockPresence' }>
const PLAINTEXT_PROTOCOLS = new Set(['HTTP', 'TCP'])

/**
 * A resource reference embedded in an unresolved expression, e.g.
 * `${aws_s3_bucket.data.id}` -> captures type `aws_s3_bucket`, name `data`.
 * Used only as a fallback when `resolvedRef` is not set — normalize
 * surfaces `resolvedRef` for both direct refs and `var`/`local` chains
 * that bottom out at a resource ref, so the engine usually does not
 * need to inspect the expr string itself.
 */
const RESOURCE_REF = /\$\{\s*([a-z][a-z0-9_]*)\.([A-Za-z0-9_-]+)/

/**
 * A sole `var.x` / `local.y` reference that the chain did NOT resolve to
 * a resource ref — i.e. the var has no default and no module-caller input.
 * Used to detect "this `via` attribute points at *some* parent, but we
 * cannot know which one" so `mustHaveAssociated` can degrade to
 * could-not-evaluate instead of false-violating.
 */
const UNRESOLVED_REF = /^\$\{(var|local)\.([A-Za-z0-9_-]+)\}$/

/**
 * Cross-resource association index: parent address -> set of
 * `childType|viaAttr` entries that reference it. Built once per evaluation
 * so `mustHaveAssociated` is a map lookup, not an O(n^2) scan.
 */
type Associations = Map<string, Set<string>>

/**
 * Child resource + via-attribute pairs whose `via` attribute is an
 * UNRESOLVABLE var/local chain — the child points at *some* parent, but
 * the chain never bottoms out at a concrete resource ref (e.g.
 * `bucket = var.bucket_id` with no default and no module input). Keyed
 * `childType|viaAttr` -> count. Used by `mustHaveAssociated` to emit
 * could-not-evaluate (rather than a false violation) for the parent.
 */
type UnresolvableCandidates = Map<string, number>

interface EvalContext {
  readonly associations: Associations
  readonly unresolvableCandidates: UnresolvableCandidates
}

function buildAssociations(resources: NormalizedResource[]): EvalContext {
  const idx: Associations = new Map()
  const unresolved: UnresolvableCandidates = new Map()
  for (const res of resources) {
    for (const [attr, v] of Object.entries(res.attributes)) {
      if (v.kind !== 'unresolved') continue
      const key = `${res.type}|${attr}`

      // Prefer the structured `resolvedRef` (covers both direct refs and
      // var/local chains that bottom out at a resource ref). Fall back to
      // inspecting the expr for any other unresolved shape.
      if (v.resolvedRef) {
        const parentAddr = `${v.resolvedRef.type}.${v.resolvedRef.name}`
        const set = idx.get(parentAddr) ?? new Set<string>()
        set.add(key)
        idx.set(parentAddr, set)
        continue
      }

      // A sole `${var.x}` / `${local.y}` whose chain did NOT resolve to a
      // resource ref — record it as an unresolvable candidate so the parent
      // can degrade to could-not-evaluate rather than false-violating.
      if (UNRESOLVED_REF.test(v.expr)) {
        unresolved.set(key, (unresolved.get(key) ?? 0) + 1)
        continue
      }

      // Any other unresolved expression — try the fallback regex for a
      // direct (non-var/local) resource ref. Compound interpolations and
      // function calls fall through (no match) and are simply ignored,
      // matching prior behavior.
      const m = RESOURCE_REF.exec(v.expr)
      if (!m) continue
      const parentAddr = `${m[1]}.${m[2]}`
      const set = idx.get(parentAddr) ?? new Set<string>()
      set.add(key)
      idx.set(parentAddr, set)
    }
  }
  return { associations: idx, unresolvableCandidates: unresolved }
}

const assertNever = (x: never): never => {
  throw new Error(`unhandled condition: ${JSON.stringify(x)}`)
}

/**
 * Whether a resource is in scope for a given condition of a rule. The
 * base match is target-vs-type; denyIngress additionally reaches the
 * decomposed ingress-rule resource (per-condition, so mustHaveTags on a
 * security group does not).
 */
function inScope(
  condition: Condition,
  target: ResourceTarget,
  r: NormalizedResource,
): boolean {
  if (target.kind === 'all') return true
  if (target.types.includes(r.type)) return true
  // Decomposed "child" resources are governed by a rule on their parent
  // type: separate ingress-rule resources for denyIngress, separate
  // bucket-acl resources for denyAcl (both are modern replacements for an
  // inline block/argument).
  if (
    condition.kind === 'denyIngress' &&
    target.types.includes(AwsResource.SecurityGroup) &&
    r.type === AwsResource.VpcSecurityGroupIngressRule
  )
    return true
  return (
    condition.kind === 'denyAcl' &&
    target.types.includes(AwsResource.S3Bucket) &&
    r.type === AwsResource.S3BucketAcl
  )
}

/**
 * Environment scoping is a filter, not a check: an env-scoped rule applies
 * only to resources whose `environment` tag resolves to that environment.
 * A resource with an absent/unresolved environment is skipped (fail-open) —
 * pair env-scoped rules with a `mustHaveTags(Environment)` rule so every
 * resource is forced to declare its environment (defense in depth, doc 04).
 */
function environmentMatches(rule: Rule, r: NormalizedResource): boolean {
  if (!rule.environment) return true
  return (
    r.environment?.kind === 'literal' &&
    r.environment.value === rule.environment
  )
}

const isLiteralNumber = (
  v: NormalizedValue,
): v is { kind: 'literal'; value: number } =>
  v.kind === 'literal' && typeof v.value === 'number'

const portInRange = (port: number, ing: IngressRule): boolean | 'unknown' => {
  if (!isLiteralNumber(ing.fromPort) || !isLiteralNumber(ing.toPort))
    return 'unknown'
  return port >= ing.fromPort.value && port <= ing.toPort.value
}

/**
 * Shared port/CIDR check for deny-ingress and deny-egress (three-way):
 * does any rule in `rules` open a targeted port to a targeted CIDR?
 */
function evalPortCidr(
  c: { ports: Port[]; from: Cidr[] },
  rules: IngressRule[],
  direction: string,
): ConditionOutcome {
  let sawUnknown = false

  for (const ing of rules) {
    const portMatches = c.ports.map((p) => portInRange(p, ing))
    if (portMatches.includes('unknown')) {
      sawUnknown = true
      continue
    }
    if (!portMatches.includes(true)) continue // no targeted port on this rule

    const literalCidrs = ing.cidrBlocks.filter((v) => v.kind === 'literal')
    const hasUnresolvedCidr = ing.cidrBlocks.some(
      (v) => v.kind === 'unresolved',
    )

    const matchedCidr = literalCidrs.find(
      (v) => v.kind === 'literal' && c.from.includes(v.value as never),
    )
    if (matchedCidr && matchedCidr.kind === 'literal') {
      return {
        kind: 'violation',
        detail: `port ${c.ports.join('/')} open to ${matchedCidr.value}`,
      }
    }
    if (hasUnresolvedCidr) sawUnknown = true
  }

  if (sawUnknown)
    return {
      kind: 'cannotEvaluate',
      reason: `${direction} port or cidr is an unresolved reference`,
    }
  return { kind: 'pass' }
}

const evalDenyIngress = (c: DenyIngress, r: NormalizedResource) =>
  evalPortCidr(c, r.ingress, 'ingress')

const evalDenyEgress = (c: DenyEgress, r: NormalizedResource) =>
  evalPortCidr(c, r.egress ?? [], 'egress')

/** Evaluate one mustHaveTags condition (three-way). */
function evalMustHaveTags(
  c: MustHaveTags,
  r: NormalizedResource,
): ConditionOutcome {
  if (r.tags.kind === 'unresolved')
    return {
      kind: 'cannotEvaluate',
      reason: 'tags are an unresolved reference',
    }
  const present = new Set(r.tags.keys)
  const missing = c.tags.filter((t) => !present.has(t))
  if (missing.length === 0) return { kind: 'pass' }
  // A `partial` set (e.g. merge(<literal>, var.tags)) proves presence but not
  // absence — a var arg may supply the missing key, so don't claim a
  // violation; degrade honestly instead.
  if (r.tags.kind === 'partial')
    return {
      kind: 'cannotEvaluate',
      reason: `tag(s) not in the resolvable portion (a var/merge arg may add them): ${missing.join(', ')}`,
    }
  return { kind: 'violation', detail: `missing tags: ${missing.join(', ')}` }
}

const isLiteralTrue = (v: NormalizedValue | undefined): boolean =>
  v?.kind === 'literal' && v.value === true

/**
 * Boolean attribute must be true. An absent attribute counts as not-true
 * (matches the AWS default of `false` for the attributes this targets,
 * e.g. storage_encrypted); an unresolved value degrades to cannotEvaluate.
 */
function evalMustBeTrue(
  c: MustBeTrue,
  r: NormalizedResource,
): ConditionOutcome {
  let sawUnknown = false
  const failing: string[] = []
  for (const attr of c.attrs) {
    const v = r.attributes[attr]
    if (v?.kind === 'unresolved') {
      sawUnknown = true
      continue
    }
    if (!isLiteralTrue(v)) failing.push(attr)
  }
  if (failing.length > 0)
    return { kind: 'violation', detail: `must be true: ${failing.join(', ')}` }
  if (sawUnknown)
    return {
      kind: 'cannotEvaluate',
      reason: 'attribute is an unresolved reference',
    }
  return { kind: 'pass' }
}

const isLiteralFalse = (v: NormalizedValue | undefined): boolean =>
  v?.kind === 'literal' && v.value === false

/**
 * Boolean attribute must be explicitly false. Absent counts as a
 * violation — use for attributes whose insecure AWS default is `true`
 * (e.g. EKS `vpc_config.endpoint_public_access`). Unresolved => cannot evaluate.
 */
function evalMustBeFalse(
  c: MustBeFalse,
  r: NormalizedResource,
): ConditionOutcome {
  let sawUnknown = false
  const failing: string[] = []
  for (const attr of c.attrs) {
    const v = r.attributes[attr]
    if (v?.kind === 'unresolved') {
      sawUnknown = true
      continue
    }
    if (!isLiteralFalse(v)) failing.push(attr)
  }
  if (failing.length > 0)
    return { kind: 'violation', detail: `must be false: ${failing.join(', ')}` }
  if (sawUnknown)
    return {
      kind: 'cannotEvaluate',
      reason: 'attribute is an unresolved reference',
    }
  return { kind: 'pass' }
}

/**
 * AwsAttribute must be present. Absent is the violation; any value — literal
 * or an unresolved reference — counts as set (so this never degrades to
 * cannotEvaluate: presence is statically knowable).
 */
function evalMustBeSet(c: MustBeSet, r: NormalizedResource): ConditionOutcome {
  const missing = c.attrs.filter((a) => r.attributes[a] === undefined)
  if (missing.length > 0)
    return { kind: 'violation', detail: `must be set: ${missing.join(', ')}` }
  return { kind: 'pass' }
}

/** Boolean attribute must not be true (absent => not-true => pass). */
function evalDenyWhenTrue(
  c: DenyWhenTrue,
  r: NormalizedResource,
): ConditionOutcome {
  let sawUnknown = false
  const offending: string[] = []
  for (const attr of c.attrs) {
    const v = r.attributes[attr]
    if (v?.kind === 'unresolved') {
      sawUnknown = true
      continue
    }
    if (isLiteralTrue(v)) offending.push(attr)
  }
  if (offending.length > 0)
    return {
      kind: 'violation',
      detail: `must not be true: ${offending.join(', ')}`,
    }
  if (sawUnknown)
    return {
      kind: 'cannotEvaluate',
      reason: 'attribute is an unresolved reference',
    }
  return { kind: 'pass' }
}

/** Deny a public ACL. Absent `acl` => default private => pass. */
function evalDenyAcl(c: DenyAcl, r: NormalizedResource): ConditionOutcome {
  const v = r.attributes.acl
  if (v === undefined) return { kind: 'pass' }
  if (v.kind === 'unresolved')
    return { kind: 'cannotEvaluate', reason: 'acl is an unresolved reference' }
  if (c.acls.includes(v.value as never))
    return { kind: 'violation', detail: `acl is ${v.value}` }
  return { kind: 'pass' }
}

/** AwsAttribute must equal a specific value (absent => not equal => violation). */
function evalMustEqual(c: MustEqual, r: NormalizedResource): ConditionOutcome {
  const v = r.attributes[c.attr]
  if (v?.kind === 'unresolved')
    return {
      kind: 'cannotEvaluate',
      reason: `${c.attr} is an unresolved reference`,
    }
  if (v?.kind === 'literal' && String(v.value) === c.value)
    return { kind: 'pass' }
  return { kind: 'violation', detail: `${c.attr} must equal "${c.value}"` }
}

/** Numeric attribute must be >= min (absent/below => violation). */
function evalMustBeAtLeast(
  c: MustBeAtLeast,
  r: NormalizedResource,
): ConditionOutcome {
  const v = r.attributes[c.attr]
  if (v?.kind === 'unresolved')
    return {
      kind: 'cannotEvaluate',
      reason: `${c.attr} is an unresolved reference`,
    }
  if (v?.kind === 'literal' && typeof v.value === 'number' && v.value >= c.min)
    return { kind: 'pass' }
  return { kind: 'violation', detail: `${c.attr} must be >= ${c.min}` }
}

/** Numeric attribute must be <= max (absent/above => violation). */
function evalMustBeAtMost(
  c: MustBeAtMost,
  r: NormalizedResource,
): ConditionOutcome {
  const v = r.attributes[c.attr]
  if (v?.kind === 'unresolved')
    return {
      kind: 'cannotEvaluate',
      reason: `${c.attr} is an unresolved reference`,
    }
  if (v?.kind === 'literal' && typeof v.value === 'number' && v.value <= c.max)
    return { kind: 'pass' }
  return { kind: 'violation', detail: `${c.attr} must be <= ${c.max}` }
}

/**
 * Flag over-permissive IAM `Allow` statements:
 *  - `Action: "*"` (full privileges) — sharpened to "full administrative
 *    access" when paired with `Resource: "*";
 *  - `NotAction` (allow everything EXCEPT a list) — an over-broad grant AWS
 *    warns against, and a real least-privilege anti-pattern.
 * A literal-JSON or `jsonencode(<HCL literal>)` policy is parsed; a
 * `jsonencode(var.x)`/`local.x`/bare-variable policy is `unresolved` =>
 * could-not-evaluate.
 */
function evalDenyIamWildcard(
  _c: DenyIamWildcard,
  r: NormalizedResource,
): ConditionOutcome {
  const p = r.policy
  if (!p) return { kind: 'pass' } // no inline policy document
  if (p.kind === 'unresolved')
    return {
      kind: 'cannotEvaluate',
      reason:
        'IAM policy is not statically resolvable (jsonencode(var/local) or non-literal expression)',
    }
  for (const s of p.statements) {
    if (s.effect.toLowerCase() !== 'allow') continue
    if (s.actions.includes('*'))
      return {
        kind: 'violation',
        detail: s.resources.includes('*')
          ? 'Allow grants Action "*" on Resource "*" (full administrative access)'
          : 'Allow statement grants Action "*" (full privileges)',
      }
    if (s.notActions.length > 0)
      return {
        kind: 'violation',
        detail: `Allow with NotAction grants everything except ${s.notActions.join(', ')}`,
      }
  }
  return { kind: 'pass' }
}

/**
 * Flag an `Allow` statement with `Principal: "*"` (public access — everyone
 * can access the resource). CIS AWS: S3 bucket policies should not grant
 * public access. A `Deny` with `Principal: "*"` is fine (restrictive). A
 * `jsonencode(var.x)`/unresolved policy degrades to could-not-evaluate.
 */
function evalDenyPublicPrincipal(
  _c: DenyPublicPrincipal,
  r: NormalizedResource,
): ConditionOutcome {
  const p = r.policy
  if (!p) return { kind: 'pass' }
  if (p.kind === 'unresolved')
    return {
      kind: 'cannotEvaluate',
      reason:
        'policy is not statically resolvable (jsonencode(var/local) or non-literal expression)',
    }
  for (const s of p.statements) {
    if (s.effect.toLowerCase() !== 'allow') continue
    if (s.principals.includes('*'))
      return {
        kind: 'violation',
        detail: 'Allow statement grants access to Principal "*" (public)',
      }
  }
  return { kind: 'pass' }
}

/**
 * Require the resource's `policy` to deny non-SSL transport — a `Deny`
 * statement with `Condition: { Bool: { "aws:SecureTransport": "false" } }`
 * (CIS AWS — S3 bucket policies should reject HTTP). Passes when no policy
 * is present (combine with `mustHaveAssociated` to require a policy exists).
 * A `jsonencode(var.x)`/unresolved policy degrades to could-not-evaluate.
 * The `"false"` value is compared case-insensitively; only the `Bool`
 * operator is matched (not `BoolIfExists` — a weaker condition that does
 * not satisfy the CIS control).
 */
function evalRequireSslOnlyPolicy(
  _c: RequireSslOnlyPolicy,
  r: NormalizedResource,
): ConditionOutcome {
  const p = r.policy
  if (!p) return { kind: 'pass' } // no policy — not this rule's concern
  if (p.kind === 'unresolved')
    return {
      kind: 'cannotEvaluate',
      reason:
        'policy is not statically resolvable (jsonencode(var/local) or non-literal expression)',
    }
  for (const s of p.statements) {
    if (s.effect.toLowerCase() !== 'deny') continue
    const bool = s.conditions.Bool
    if (!bool) continue
    const transport = bool['aws:SecureTransport']
    if (transport && transport.some((v) => v.toLowerCase() === 'false'))
      return { kind: 'pass' }
  }
  return {
    kind: 'violation',
    detail:
      'policy does not deny non-SSL transport (no Deny with Condition Bool aws:SecureTransport=false)',
  }
}

const literalItems = (items: NormalizedValue[]): unknown[] =>
  items
    .filter((i) => i.kind === 'literal')
    .map((i) => (i as { value: unknown }).value)

const hasUnresolvedItem = (items: NormalizedValue[]): boolean =>
  items.some((i) => i.kind === 'unresolved')

/** Flag a list attribute that contains any forbidden value (three-way). */
function evalListContains(
  c: ListContains,
  r: NormalizedResource,
): ConditionOutcome {
  const l = r.lists?.[c.attr]
  if (!l) {
    // whole list may be an unresolved reference stored as a scalar
    return r.attributes[c.attr]?.kind === 'unresolved'
      ? {
          kind: 'cannotEvaluate',
          reason: `${c.attr} is an unresolved reference`,
        }
      : { kind: 'pass' } // absent list -> nothing forbidden present
  }
  if (l.kind === 'unresolved')
    return {
      kind: 'cannotEvaluate',
      reason: `${c.attr} is an unresolved reference`,
    }
  const found = literalItems(l.items).find((v) =>
    c.values.includes(v as string),
  )
  if (found !== undefined)
    return {
      kind: 'violation',
      detail: `${c.attr} contains "${String(found)}"`,
    }
  if (hasUnresolvedItem(l.items))
    return {
      kind: 'cannotEvaluate',
      reason: `${c.attr} has an unresolved element`,
    }
  return { kind: 'pass' }
}

/** Require a list attribute to include all of `values` (three-way). */
function evalListMustInclude(
  c: ListMustInclude,
  r: NormalizedResource,
): ConditionOutcome {
  const l = r.lists?.[c.attr]
  if (!l)
    return r.attributes[c.attr]?.kind === 'unresolved'
      ? {
          kind: 'cannotEvaluate',
          reason: `${c.attr} is an unresolved reference`,
        }
      : {
          kind: 'violation',
          detail: `${c.attr} must include ${c.values.join(', ')}`,
        }
  if (l.kind === 'unresolved')
    return {
      kind: 'cannotEvaluate',
      reason: `${c.attr} is an unresolved reference`,
    }
  const present = literalItems(l.items)
  const missing = c.values.filter((v) => !present.includes(v))
  if (missing.length === 0) return { kind: 'pass' }
  if (hasUnresolvedItem(l.items))
    return {
      kind: 'cannotEvaluate',
      reason: `${c.attr} has an unresolved element`,
    }
  return {
    kind: 'violation',
    detail: `${c.attr} must include ${missing.join(', ')}`,
  }
}

/** Flag a scalar attribute whose literal value is in a forbidden set. */
function evalDenyValue(c: DenyValue, r: NormalizedResource): ConditionOutcome {
  const v = r.attributes[c.attr]
  if (v === undefined) return { kind: 'pass' } // absent
  if (v.kind === 'unresolved')
    return {
      kind: 'cannotEvaluate',
      reason: `${c.attr} is an unresolved reference`,
    }
  if (c.values.includes(String(v.value)))
    return { kind: 'violation', detail: `${c.attr} is "${String(v.value)}"` }
  return { kind: 'pass' }
}

/**
 * Allowlist: the attribute's literal value must be one of `values`. Absent
 * or any other value is a violation (mirror of denyValue); unresolved =>
 * cannot evaluate.
 */
function evalMustBeOneOf(
  c: MustBeOneOf,
  r: NormalizedResource,
): ConditionOutcome {
  const v = r.attributes[c.attr]
  if (v?.kind === 'unresolved')
    return {
      kind: 'cannotEvaluate',
      reason: `${c.attr} is an unresolved reference`,
    }
  if (v?.kind === 'literal' && c.values.includes(String(v.value)))
    return { kind: 'pass' }
  return {
    kind: 'violation',
    detail: `${c.attr} must be one of ${c.values.join(', ')}`,
  }
}

/**
 * Flag a plaintext listener (`protocol` HTTP/TCP) — unless it exists only
 * to redirect to HTTPS (`default_action.type = "redirect"`), the standard
 * safe pattern. Absent/unresolved protocol => pass / could-not-evaluate.
 */
function evalDenyPlaintextListener(
  _c: DenyPlaintextListener,
  r: NormalizedResource,
): ConditionOutcome {
  const proto = r.attributes.protocol
  if (proto === undefined) return { kind: 'pass' }
  if (proto.kind === 'unresolved')
    return {
      kind: 'cannotEvaluate',
      reason: 'listener protocol is an unresolved reference',
    }
  if (!PLAINTEXT_PROTOCOLS.has(String(proto.value))) return { kind: 'pass' }
  const action = r.attributes['default_action.type']
  if (action?.kind === 'literal' && action.value === 'redirect')
    return { kind: 'pass' } // HTTP->HTTPS redirect is fine
  return {
    kind: 'violation',
    detail: `plaintext listener (protocol ${String(proto.value)})`,
  }
}

/**
 * Flag an ECS task definition with a privileged container. Parses a
 * literal-JSON `container_definitions` array or a `jsonencode(<HCL array
 * literal>)` expression; a `jsonencode(var.x)`/bare-variable value degrades
 * to could-not-evaluate. If `privileged` is an interpolated value (lenient
 * parsing kept it as a string), degrades to could-not-evaluate for that
 * container rather than treating it as false (a silent pass would be wrong).
 */
function evalDenyPrivilegedContainers(
  _c: DenyPrivilegedContainers,
  r: NormalizedResource,
): ConditionOutcome {
  const c = r.containers
  if (!c) return { kind: 'pass' }
  if (c.kind === 'unresolved')
    return {
      kind: 'cannotEvaluate',
      reason:
        'container_definitions is not statically resolvable (jsonencode(var/local) or non-literal expression)',
    }
  // Flag definite violations first (privileged = true), then degrade to
  // could-not-evaluate if any container's privileged was an interpolated ref.
  const priv = c.containers.find((x) => x.privileged)
  if (priv)
    return { kind: 'violation', detail: `privileged container "${priv.name}"` }
  const unresolved = c.containers.find((x) => x.privilegedUnresolved)
  if (unresolved)
    return {
      kind: 'cannotEvaluate',
      reason: `container "${unresolved.name}" has an unresolved privileged reference`,
    }
  return { kind: 'pass' }
}

/**
 * Flag ECS containers with plaintext secrets in `environment` variables —
 * an env var whose NAME matches a secret-like pattern (PASSWORD, SECRET,
 * KEY, TOKEN, CREDENTIAL) AND whose VALUE is a literal string (not a
 * `${var.x}` reference). References are the correct pattern (Secrets Manager
 * / SSM Parameter Store); hardcoded literals are the violation. CIS AWS:
 * secrets should not be in plaintext environment variables.
 */
const SECRET_NAME_PATTERN =
  /(password|passwd|secret|api[_-]?key|access[_-]?key|secret[_-]?key|private[_-]?key|token|credential)/i

function evalDenyPlaintextEnvSecrets(
  _c: DenyPlaintextEnvSecrets,
  r: NormalizedResource,
): ConditionOutcome {
  const sawUnknown: string[] = []
  // ECS container_definitions path.
  const c = r.containers
  if (c?.kind === 'unresolved')
    sawUnknown.push('container_definitions is not statically resolvable')
  if (c?.kind === 'parsed') {
    for (const container of c.containers) {
      for (const env of container.environment) {
        if (env.isLiteral && SECRET_NAME_PATTERN.test(env.name)) {
          return {
            kind: 'violation',
            detail: `plaintext secret in environment variable "${env.name}" of container "${container.name}" — use a reference (Secrets Manager / SSM Parameter Store)`,
          }
        }
      }
    }
  }
  // Serverless env-var map path (Lambda / Azure Functions / Cloud Run Functions).
  const ev = r.envVars
  if (ev?.kind === 'unresolved')
    sawUnknown.push('environment variables map is not statically resolvable')
  if (ev?.kind === 'parsed') {
    for (const env of ev.vars) {
      if (env.isLiteral && SECRET_NAME_PATTERN.test(env.name)) {
        return {
          kind: 'violation',
          detail: `plaintext secret in environment variable "${env.name}" — use a reference (Secrets Manager / SSM Parameter Store / Key Vault)`,
        }
      }
    }
  }
  if (sawUnknown.length > 0)
    return { kind: 'cannotEvaluate', reason: sawUnknown.join('; ') }
  return { kind: 'pass' }
}

/**
 * Flag a hardcoded literal where a reference belongs (e.g. a secret).
 * Inverts the usual semantics: a *literal* is the violation; an
 * *unresolved* reference (var/data) is the desired state and passes;
 * absent passes (nothing set here).
 */
function evalDenyLiteral(
  c: DenyLiteral,
  r: NormalizedResource,
): ConditionOutcome {
  const offending = c.attrs.filter((a) => r.attributes[a]?.kind === 'literal')
  if (offending.length > 0)
    return {
      kind: 'violation',
      detail: `hardcoded value — use a reference: ${offending.join(', ')}`,
    }
  return { kind: 'pass' }
}

/**
 * Cross-resource: pass iff some resource of `childType` references this one
 * through its `via` attribute. Association is by resource reference
 * (`bucket = aws_s3_bucket.x.id`), the idiomatic Terraform wiring; a child
 * that points at its parent by a literal name would not be linked. A
 * `var`/`local` chain that bottoms out at a resource ref is followed
 * (normalize surfaces it as `resolvedRef`); a chain that cannot be
 * resolved (a var with no default and no module-caller input) degrades to
 * could-not-evaluate rather than a false violation — real modules route
 * refs through locals, so this is the difference between a usable rule
 * and one that must be omitted.
 */
function evalMustHaveAssociated(
  c: MustHaveAssociated,
  r: NormalizedResource,
  ctx: EvalContext,
): ConditionOutcome {
  const key = `${c.childType}|${c.via}`
  if (ctx.associations.get(address(r))?.has(key)) return { kind: 'pass' }
  if (ctx.unresolvableCandidates.get(key)) {
    return {
      kind: 'cannotEvaluate',
      reason: `association via ${c.via} is an unresolvable var/local reference — cannot determine the parent`,
    }
  }
  return {
    kind: 'violation',
    detail: `no associated ${c.childType} (referencing this via ${c.via})`,
  }
}

/**
 * Whether a resource declares a given nested block. Prefers the recorded
 * block paths (which capture even empty blocks); falls back to the flattened
 * dotted keys so hand-built resources without `blocks` still work.
 */
function hasBlock(block: string, r: NormalizedResource): boolean {
  if (r.blocks?.includes(block)) return true
  const prefix = `${block}.`
  return (
    Object.keys(r.attributes).some((k) => k.startsWith(prefix)) ||
    Object.keys(r.lists ?? {}).some((k) => k.startsWith(prefix))
  )
}

/** Same-resource: pass iff the resource declares the given nested block. */
function evalMustHaveBlock(
  c: MustHaveBlock,
  r: NormalizedResource,
): ConditionOutcome {
  return hasBlock(c.block, r)
    ? { kind: 'pass' }
    : { kind: 'violation', detail: `missing ${c.block} block` }
}

/** Same-resource: flag iff the resource declares the given nested block. */
function evalDenyBlockPresence(
  c: DenyBlockPresence,
  r: NormalizedResource,
): ConditionOutcome {
  return hasBlock(c.block, r)
    ? { kind: 'violation', detail: `${c.block} block must not be declared` }
    : { kind: 'pass' }
}

/** Exhaustive dispatch: a new condition kind is a compile error (Layer 4). */
function evalCondition(
  c: Condition,
  r: NormalizedResource,
  ctx: EvalContext,
): ConditionOutcome {
  switch (c.kind) {
    case 'denyIngress':
      return evalDenyIngress(c, r)
    case 'denyEgress':
      return evalDenyEgress(c, r)
    case 'mustHaveTags':
      return evalMustHaveTags(c, r)
    case 'mustBeTrue':
      return evalMustBeTrue(c, r)
    case 'mustBeFalse':
      return evalMustBeFalse(c, r)
    case 'mustBeSet':
      return evalMustBeSet(c, r)
    case 'denyWhenTrue':
      return evalDenyWhenTrue(c, r)
    case 'denyAcl':
      return evalDenyAcl(c, r)
    case 'mustEqual':
      return evalMustEqual(c, r)
    case 'mustBeAtLeast':
      return evalMustBeAtLeast(c, r)
    case 'mustBeAtMost':
      return evalMustBeAtMost(c, r)
    case 'denyIamWildcard':
      return evalDenyIamWildcard(c, r)
    case 'denyPublicPrincipal':
      return evalDenyPublicPrincipal(c, r)
    case 'requireSslOnlyPolicy':
      return evalRequireSslOnlyPolicy(c, r)
    case 'listContains':
      return evalListContains(c, r)
    case 'listMustInclude':
      return evalListMustInclude(c, r)
    case 'denyValue':
      return evalDenyValue(c, r)
    case 'mustBeOneOf':
      return evalMustBeOneOf(c, r)
    case 'denyPlaintextListener':
      return evalDenyPlaintextListener(c, r)
    case 'denyPrivilegedContainers':
      return evalDenyPrivilegedContainers(c, r)
    case 'denyPlaintextEnvSecrets':
      return evalDenyPlaintextEnvSecrets(c, r)
    case 'denyLiteral':
      return evalDenyLiteral(c, r)
    case 'mustHaveAssociated':
      return evalMustHaveAssociated(c, r, ctx)
    case 'mustHaveBlock':
      return evalMustHaveBlock(c, r)
    case 'denyBlockPresence':
      return evalDenyBlockPresence(c, r)
    default:
      return assertNever(c)
  }
}

/**
 * TOTAL: always returns a CheckReport (doc 06, Rule 4). Folds over
 * rules x conditions x in-scope resources (Rule 3), accumulating.
 */
export function evaluate(
  rules: Rule[],
  resources: NormalizedResource[],
): CheckReport {
  const violations: Violation[] = []
  const couldNotEvaluate: Unevaluable[] = []
  let passed = 0
  const ctx: EvalContext = buildAssociations(resources)

  for (const rule of rules) {
    for (const resource of resources) {
      if (!environmentMatches(rule, resource)) continue
      for (const condition of rule.conditions) {
        if (!inScope(condition, rule.target, resource)) continue

        const outcome = evalCondition(condition, resource, ctx)
        switch (outcome.kind) {
          case 'violation':
            violations.push({
              ruleId: rule.id,
              message: rule.message,
              rationale: rule.rationale,
              effect: rule.effect,
              resource: address(resource),
              file: resource.file,
              line: resource.line,
              approvers: rule.approvers,
            })
            break
          case 'cannotEvaluate':
            couldNotEvaluate.push({
              ruleId: rule.id,
              resource: address(resource),
              file: resource.file,
              line: resource.line,
              reason: outcome.reason,
            })
            break
          case 'pass':
            passed += 1
            break
        }
      }
    }
  }

  return { violations, passed, couldNotEvaluate }
}
