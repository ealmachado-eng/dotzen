import {
  Port,
  Cidr,
  Effect,
  Tag,
  Acl,
  Environment,
  Approver,
  Block,
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
  | { readonly kind: 'mustHaveTags'; readonly tags: Tag[] }
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
  | { readonly kind: 'denyLiteral'; readonly attrs: AnyAttribute[] }
  // Cross-resource: this resource must be referenced by a separate resource
  // of `childType` through its `via` attribute (e.g. an S3 bucket must have a
  // matching aws_s3_bucket_server_side_encryption_configuration).
  | {
      readonly kind: 'mustHaveAssociated'
      readonly childType: AnyResource
      readonly via: AnyAttribute
    }
  // Same-resource: this resource must declare a given nested block.
  | { readonly kind: 'mustHaveBlock'; readonly block: Block }
  // Same-resource: this resource must NOT declare a given nested block
  // (e.g. a GCP instance `access_config` = an ephemeral public IP).
  | { readonly kind: 'denyBlockPresence'; readonly block: Block }

export interface Rule {
  readonly id: string
  readonly target: ResourceTarget
  /** If set, the rule applies only to resources in this environment. */
  readonly environment?: Environment
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
  private _target?: ResourceTarget
  private _environment?: Environment
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

  environment(env: Environment): this {
    this._environment = env
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

  mustHaveTags(...tags: Tag[]): this {
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

    if (problems.length > 0) return err(problems)

    return ok({
      id: `rule-${index + 1}`,
      target: this._target!,
      environment: this._environment,
      conditions: this._conditions,
      effect: this._effect,
      message: this._message!,
      rationale: this._rationale,
      approvers: this._approvers.length > 0 ? this._approvers : undefined,
    })
  }
}

export const rule = (): RuleBuilder => new RuleBuilder()
