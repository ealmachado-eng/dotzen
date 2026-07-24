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
}

export const address = (r: NormalizedResource): string => `${r.type}.${r.name}`
