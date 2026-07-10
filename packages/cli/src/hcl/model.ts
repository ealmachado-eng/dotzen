import { AnyResource } from '../vocabulary'

/**
 * dotzen's own resource model. The engine only ever sees this — never the
 * parser's raw output (doc 06). Unresolvable expressions are explicit,
 * which is what feeds the `couldNotEvaluate` outcome.
 */

export type NormalizedValue =
  | { readonly kind: 'literal'; readonly value: string | number | boolean }
  | { readonly kind: 'unresolved'; readonly expr: string }

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

/** One IAM policy statement (from a parsed literal-JSON policy document). */
export interface PolicyStatement {
  readonly effect: string
  readonly actions: string[]
  readonly resources: string[]
  /** `NotAction` entries — an Allow with NotAction is an over-broad grant. */
  readonly notActions: string[]
}

/**
 * An IAM `policy` argument: parsed when it is a literal JSON document
 * (heredoc / inline string); `unresolved` when it is a `jsonencode(...)`
 * expression, a variable, or malformed — which must degrade to "could not
 * evaluate" rather than a guess.
 */
export type PolicyInfo =
  | { readonly kind: 'parsed'; readonly statements: PolicyStatement[] }
  | { readonly kind: 'unresolved' }

/** A list-valued attribute (array of scalars), for `listContains`/`listMustInclude`. */
export type ListInfo =
  | { readonly kind: 'resolved'; readonly items: NormalizedValue[] }
  | { readonly kind: 'unresolved' }

/** One ECS container (from a parsed literal-JSON `container_definitions`). */
export interface ContainerDef {
  readonly name: string
  readonly privileged: boolean
}

export type ContainerInfo =
  | { readonly kind: 'parsed'; readonly containers: ContainerDef[] }
  | { readonly kind: 'unresolved' }

export interface NormalizedResource {
  readonly type: AnyResource
  readonly name: string
  readonly file: string
  readonly line: number
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
}

export const address = (r: NormalizedResource): string => `${r.type}.${r.name}`
