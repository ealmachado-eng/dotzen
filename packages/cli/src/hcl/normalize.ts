import {
  AwsResource,
  AzureResource,
  GcpResource,
  DataResource,
  AnyResource,
} from '../vocabulary'
import {
  NormalizedResource,
  IngressRule,
  NormalizedValue,
  ResolvedRef,
  TagsInfo,
  PolicyInfo,
  ListInfo,
  ContainerInfo,
  ContainerDef,
  EnvVar,
  EnvVarsInfo,
  NormalizedOutput,
  NormalizedBinding,
  NormalizedTerraformSettings,
  NormalizedBackend,
} from './model'

/** hcl2json emits `{ resource: { type: { name: [block, ...] } } }`. */
export interface Hcl2JsonRoot {
  resource?: Record<string, Record<string, unknown[]>>
  variable?: Record<string, unknown[]>
  locals?: unknown[]
  /** `module "x" { source = …, <inputs> }` → `{ x: [{ source, … }] }`. */
  module?: Record<string, unknown[]>
  /** `provider "aws" { default_tags { tags = … } }` → `{ aws: [{ … }] }`. */
  provider?: Record<string, unknown[]>
  /** `output "x" { value = …, sensitive = … }` → `{ x: [{ value, sensitive }] }`. */
  output?: Record<string, unknown[]>
  /** `data "aws_ami" "x" {}` → `{ aws_ami: { x: [{ … }] } }` (same shape as
   *  `resource`, under the `data` key). Normalized with type `data.<t>`. */
  data?: Record<string, Record<string, unknown[]>>
  /** `terraform { required_version = …; required_providers { … } }` →
   *  `[{ required_version, required_providers: [{ <name>: { source, version } }] }]`. */
  terraform?: unknown[]
}

/** Resolved `var.*` / `local.*` values, keyed by reference, raw form. */
export type Scope = Map<string, unknown>

/**
 * Provider-level tag defaults (AWS `default_tags` / GCP `default_labels` /
 * Azure `default_tags`) that every resource inherits at apply time. dotzen
 * threads these so a `mustHaveTags` rule does not flag a resource whose
 * required tag is supplied by the provider rather than the resource block.
 *  - `tagKeys`: keys guaranteed present on every resource under the provider
 *    (used by `tagsOf` to upgrade an `unresolved` resource-tag map to
 *    `partial`, and to add proven-present keys to a `resolved`/`partial` set).
 *  - `tagValues`: the literal value for each such key (used by
 *    `environmentOf` so `.environment(X)` scoping works when the
 *    `environment` tag lives on the provider, not the resource).
 * Keys whose value is an unresolvable reference are OMITTED (not statically
 * proven present). Threaded through `followModules` so a child module with no
 * provider block of its own inherits the root's defaults (matches Terraform
 * provider inheritance); a child's own provider defaults merge in, with the
 * child's value winning on key conflicts.
 */
export interface ProviderDefaults {
  readonly tagKeys: string[]
  readonly tagValues: Record<string, unknown>
}

/**
 * A map of provider alias → region string, built from `provider {}` blocks in
 * a directory. The default (no-alias) provider is keyed `""`. Used to resolve
 * a resource's `providerRegion` for GDPR/LGPD residency rules — a resource
 * pinned to `provider = aws.eu` gets the region of the `aws.eu` provider
 * block. Threaded through `followModules` so child modules inherit the root's
 * region map (a child with no provider block uses the parent's regions).
 */
export type ProviderRegionMap = Map<string, string>

const KNOWN_TYPES = new Set<string>([
  ...Object.values(AwsResource),
  ...Object.values(AzureResource),
  ...Object.values(GcpResource),
  ...Object.values(DataResource),
])

/**
 * Terraform built-in / utility provider resources with no security surface
 * (ROADMAP item 4). `random_password` / `random_string` / `random_id` /
 * `random_uuid` / `random_shuffle` / `random_pet` / `random_integer` /
 * `random_bytes` — the `random` provider's primitives. Also `terraform_data`
 * (the built-in resource-as-data wrapper). These are silently skipped: NOT
 * governed (no rules apply) and NOT surfaced as ungoverned (no coverage gap
 * to report — they're plumbing, not infrastructure). Adding any future
 * utility resource is a one-line append here.
 */
const UTILITY_TYPES = new Set<string>([
  'random_password',
  'random_string',
  'random_id',
  'random_uuid',
  'random_shuffle',
  'random_pet',
  'random_integer',
  'random_bytes',
  'terraform_data',
])

const isInterpolated = (s: string): boolean => s.includes('${')

const asObject = (o: unknown): Record<string, unknown> =>
  o && typeof o === 'object' ? (o as Record<string, unknown>) : {}

/**
 * A resource reference at the bottom of a var/local chain, e.g.
 * `${aws_s3_bucket.main.id}` → { type: 'aws_s3_bucket', name: 'main' }.
 * Captured at normalize time so the engine's association index can link
 * a child to its parent through `local`/`var` indirection without
 * needing scope access at evaluate time. Returns undefined for non-ref
 * expressions (literals, compound interpolations, function calls).
 */
const RESOURCE_REF_AT_BOTTOM = /\$\{\s*([a-z][a-z0-9_]*)\.([A-Za-z0-9_-]+)/
const refAtBottom = (raw: unknown): ResolvedRef | undefined => {
  if (typeof raw !== 'string') return undefined
  const m = RESOURCE_REF_AT_BOTTOM.exec(raw)
  if (!m || m[1] === undefined || m[2] === undefined) return undefined
  const prefix = m[1]
  // `var.`/`local.`/`data.` would indicate the chain didn't actually
  // bottom out at a resource ref — leave those for further resolution.
  if (prefix === 'var' || prefix === 'local' || prefix === 'data')
    return undefined
  return { type: prefix, name: m[2] }
}

function toValue(raw: unknown): NormalizedValue {
  if (typeof raw === 'string' && isInterpolated(raw))
    return { kind: 'unresolved', expr: raw, resolvedRef: refAtBottom(raw) }
  if (
    typeof raw === 'string' ||
    typeof raw === 'number' ||
    typeof raw === 'boolean'
  )
    return { kind: 'literal', value: raw }
  return { kind: 'unresolved', expr: JSON.stringify(raw) }
}

// A value that is *exactly* one `var.x` / `local.y` / `each.value` /
// `each.key` reference — the only forms we resolve. Compound interpolations
// (`"a-${var.x}"`) stay unresolved. `each.*` is set on the module scope by
// `followModules` when expanding a module `for_each` (doc 08 tranche 5).
const SOLE_REF =
  /^\$\{(var|local)\.([A-Za-z0-9_-]+)\}$|^\$\{each\.([A-Za-z0-9_-]+)\}$/

/** Build the scope key from a SOLE_REF match (`var.x`, `local.y`, `each.v`). */
const soleRefKey = (m: RegExpMatchArray): string =>
  m[1] ? `${m[1]}.${m[2]}` : `each.${m[3]}`

/**
 * Resolve a raw value against the scope. A sole `var`/`local`/`each`
 * reference is followed (through chains, depth-bounded) to its literal; a
 * reference with no known value, or any non-sole-reference expression,
 * stays unresolved — which correctly yields "could not evaluate".
 */
/**
 * Parse a scalar HCL literal (quoted string / boolean / number) from a bare
 * expression string. Returns the JS value, or undefined for anything else
 * (refs, compound exprs, null, objects, arrays). Used by the conservative
 * ternary evaluator — only literal operands are ever evaluated (never guessed).
 */
function parseHclScalar(s: string): string | number | boolean | undefined {
  const t = s.trim()
  if (t === 'true') return true
  if (t === 'false') return false
  if (t === 'null') return undefined
  const q = t[0]
  if (q === '"' || q === "'") {
    // Minimal: accept a simple quoted string (no embedded quotes for safety).
    if (t.length >= 2 && t[t.length - 1] === q) return t.slice(1, -1)
    return undefined
  }
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t)
  return undefined
}

/** Index of `ch` in `s` at brace/paren/bracket/quote depth 0, or -1. */
function topLevelIndex(s: string, ch: string): number {
  let depth = 0
  let quote: string | null = null
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quote) {
      if (c === quote && s[i - 1] !== '\\') quote = null
    } else if (c === '"' || c === "'") {
      quote = c
    } else if (c === '(' || c === '{' || c === '[') {
      depth++
    } else if (c === ')' || c === '}' || c === ']') {
      depth--
    } else if (c === ch && depth === 0) {
      return i
    }
  }
  return -1
}

/**
 * CONSERVATIVE comparison evaluator — the no-ternary form
 * `${<var|local>.x (==|!=) <scalar>}`. Returns the boolean result, or
 * undefined for anything else (compound conditions, non-scalar operands,
 * unresolvable refs, ternaries). Used by `tryEvalTernary` to resolve a
 * bare-ref condition whose scope entry IS a comparison interpolation
 * (`local.is_prod = var.env == "prd"`), the pattern ROADMAP item 3 calls out.
 */
function tryEvalComparison(
  raw: string,
  scope: Scope,
  depth: number,
): boolean | undefined {
  if (!isInterpolated(raw) || depth <= 0) return undefined
  let s = raw.trim()
  if (s.startsWith('${') && s.endsWith('}')) s = s.slice(2, -1).trim()
  // A ternary is not a comparison — let tryEvalTernary handle it.
  if (topLevelIndex(s, '?') !== -1) return undefined
  const cm = /^(var|local)\.([A-Za-z0-9_-]+)\s*(==|!=)\s*(.+)$/.exec(s)
  if (!cm) return undefined
  const refKey = `${cm[1]}.${cm[2]}`
  const condScalar = parseHclScalar(cm[4]!)
  if (condScalar === undefined) return undefined
  const refRaw = resolveRaw(`\${${refKey}}`, scope, depth - 1)
  if (refRaw === undefined) return undefined
  const refLit = toValue(refRaw)
  if (refLit.kind !== 'literal') return undefined
  return cm[3] === '=='
    ? refLit.value === condScalar
    : refLit.value !== condScalar
}

/**
 * CONSERVATIVE ternary evaluator (#16). Evaluates ONLY the safe form
 * `${<var|local>.x (==|!=) <scalar> ? <scalar> : <scalar>}` — a strict-equality
 * ternary whose ref resolves (via scope) to a literal and whose branches are
 * both scalar literals — OR the bare-ref form `${<ref> ? <scalar> : <scalar>}`
 * where <ref> resolves to a boolean literal (directly, or through a local
 * whose value is itself a conservative comparison interpolation — ROADMAP #3:
 * `local.is_prod = var.env == "prd"`). Returns the chosen literal
 * NormalizedValue, or undefined for ANYTHING else (compound conditions, nested
 * ternaries, non-scalar branches, unresolvable refs, non-boolean bare-ref
 * conditions, non-ternary exprs) so the caller falls through to the honest
 * unresolved path — never a guess, never a false verdict.
 */
function tryEvalTernary(
  raw: string,
  scope: Scope,
  depth: number,
): NormalizedValue | undefined {
  if (!isInterpolated(raw) || depth <= 0) return undefined
  let s = raw.trim()
  if (s.startsWith('${') && s.endsWith('}')) s = s.slice(2, -1).trim()
  const qIdx = topLevelIndex(s, '?')
  if (qIdx === -1) return undefined
  const cond = s.slice(0, qIdx).trim()
  const rest = s.slice(qIdx + 1)
  const cIdx = topLevelIndex(rest, ':')
  if (cIdx === -1) return undefined
  const trueB = rest.slice(0, cIdx).trim()
  const falseB = rest.slice(cIdx + 1).trim()
  // Condition form 1: <ref> (==|!=) <scalar>  (inline compare — the original #16 path).
  const cm = /^(var|local)\.([A-Za-z0-9_-]+)\s*(==|!=)\s*(.+)$/.exec(cond)
  let chosen: string | undefined
  if (cm) {
    const refKey = `${cm[1]}.${cm[2]}`
    const condScalar = parseHclScalar(cm[4]!)
    if (condScalar === undefined) return undefined
    const refRaw = resolveRaw(`\${${refKey}}`, scope, depth - 1)
    if (refRaw === undefined) return undefined
    const refLit = toValue(refRaw)
    if (refLit.kind !== 'literal') return undefined
    const eq = refLit.value === condScalar
    chosen = (cm[3] === '==' ? eq : !eq) ? trueB : falseB
  } else {
    // Condition form 2: bare <ref> — must resolve to a boolean (directly or
    // via a comparison stored in a local; ROADMAP item 3). Non-boolean literals
    // (strings/numbers) are NOT truthy in Terraform — refuse to guess.
    const bm = /^(var|local)\.([A-Za-z0-9_-]+)$/.exec(cond)
    if (!bm) return undefined
    const refKey = `${bm[1]}.${bm[2]}`
    let bool: boolean | undefined
    // (a) scope entry is a raw interpolation string → try evaluating it as a
    //     comparison (local.is_prod = "${var.env == \"prd\"}").
    const scopeRaw = scope.get(refKey)
    if (typeof scopeRaw === 'string' && isInterpolated(scopeRaw)) {
      bool = tryEvalComparison(scopeRaw, scope, depth - 1)
    }
    // (b) fall back to resolveRaw → boolean literal (local.is_prod = true).
    if (bool === undefined) {
      const refRaw = resolveRaw(`\${${refKey}}`, scope, depth - 1)
      if (refRaw === undefined) return undefined
      const refLit = toValue(refRaw)
      if (refLit.kind !== 'literal' || typeof refLit.value !== 'boolean')
        return undefined
      bool = refLit.value
    }
    chosen = bool ? trueB : falseB
  }
  const chosenScalar = parseHclScalar(chosen)
  if (chosenScalar === undefined) return undefined
  return { kind: 'literal', value: chosenScalar }
}

function resolveValue(raw: unknown, scope: Scope, depth = 8): NormalizedValue {
  if (typeof raw === 'string') {
    const m = SOLE_REF.exec(raw)
    if (m) {
      const key = soleRefKey(m)
      if (depth > 0 && scope.has(key))
        return resolveValue(scope.get(key), scope, depth - 1)
      return { kind: 'unresolved', expr: raw }
    }
    // Conservative ternary eval (#16) — only the safe strict-equality form;
    // anything else returns undefined and falls through to unresolved.
    const ternary = tryEvalTernary(raw, scope, depth)
    if (ternary !== undefined) return ternary
  }
  return toValue(raw)
}

/** Collect `variable` defaults and `locals` from all parsed files. */
export function buildScope(roots: Hcl2JsonRoot[]): Scope {
  const scope: Scope = new Map()
  for (const root of roots) {
    for (const [name, blocks] of Object.entries(root.variable ?? {})) {
      const b = asObject(Array.isArray(blocks) ? blocks[0] : undefined)
      if ('default' in b) scope.set(`var.${name}`, b.default)
    }
    if (Array.isArray(root.locals)) {
      for (const block of root.locals) {
        for (const [k, v] of Object.entries(asObject(block)))
          scope.set(`local.${k}`, v)
      }
    }
  }
  return scope
}

/**
 * The tag/label map a provider block carries, accounting for provider naming:
 * AWS and Azure nest it under `default_tags { tags = … }`; GCP (google) uses
 * `default_labels { labels = … }`. hcl2json emits the nested block as an
 * array of one object. Returns the raw map (object | undefined).
 */
function providerTagMap(
  provName: string,
  block: Record<string, unknown>,
): unknown {
  const nested = provName === 'google' ? 'default_labels' : 'default_tags'
  const inner = provName === 'google' ? 'labels' : 'tags'
  const dt = block[nested]
  // hcl2json wraps a nested block as `[ { … } ]`.
  const dtObj = Array.isArray(dt) ? asObject(dt[0]) : asObject(dt)
  return dtObj[inner]
}

/**
 * Collect provider default_tags/default_labels across all parsed files in a
 * directory. Each provider's tag map is resolved through `scope`: a literal
 * map yields its keys; a sole `var.x`/`local.y` reference is followed to its
 * literal. Keys whose value is UNRESOLVABLE (no default, a function call, a
 * compound expression) are OMITTED — they are not statically proven present,
 * so claiming them could hide a real violation. Multiple provider blocks
 * contribute additively (presence is union). Returns undefined when no
 * provider declares any resolvable default tags.
 */
export function providerDefaults(
  roots: Hcl2JsonRoot[],
  scope: Scope,
): ProviderDefaults | undefined {
  const keys = new Set<string>()
  const values: Record<string, unknown> = {}
  for (const root of roots) {
    for (const [provName, blocks] of Object.entries(root.provider ?? {})) {
      for (const b of Array.isArray(blocks) ? blocks : []) {
        const map = providerTagMap(provName, asObject(b))
        const resolved = typeof map === 'string' ? resolveRaw(map, scope) : map
        if (
          !resolved ||
          typeof resolved !== 'object' ||
          Array.isArray(resolved)
        )
          continue
        for (const [k, v] of Object.entries(
          resolved as Record<string, unknown>,
        )) {
          keys.add(k)
          values[k] = v
        }
      }
    }
  }
  if (keys.size === 0) return undefined
  return { tagKeys: [...keys], tagValues: values }
}

/**
 * Merge an inherited ProviderDefaults chain (from enclosing module calls)
 * with a child dir's own provider defaults. Keys UNION (both levels guarantee
 * presence); on a key conflict the CHILD's value wins (a child provider
 * config overrides the inherited one). Returns the child if no parent, the
 * parent if no child, or undefined if neither declares defaults.
 */
export function mergeProviderDefaults(
  parent: ProviderDefaults | undefined,
  child: ProviderDefaults | undefined,
): ProviderDefaults | undefined {
  if (!parent) return child
  if (!child) return parent
  const keys = new Set([...parent.tagKeys, ...child.tagKeys])
  const values: Record<string, unknown> = { ...parent.tagValues }
  for (const k of child.tagKeys) values[k] = child.tagValues[k]
  return { tagKeys: [...keys], tagValues: values }
}

/**
 * Build a provider alias → region map from all `provider {}` blocks in the
 * parsed files. The default (no-alias) provider is keyed `""`. hcl2json emits
 * `provider: { aws: [{ region, alias? }, ...] }` — multiple blocks per
 * provider type (one per alias). Returns an empty map if no regions found.
 */
export function providerRegions(roots: Hcl2JsonRoot[]): ProviderRegionMap {
  const map: ProviderRegionMap = new Map()
  for (const root of roots) {
    for (const [, blocks] of Object.entries(root.provider ?? {})) {
      for (const b of Array.isArray(blocks) ? blocks : []) {
        const obj = asObject(b)
        const region = typeof obj.region === 'string' ? obj.region : undefined
        if (region === undefined) continue
        const alias = typeof obj.alias === 'string' ? obj.alias : ''
        // First-write wins (Terraform errors on duplicate provider configs);
        // don't overwrite an existing alias→region from an earlier file.
        if (!map.has(alias)) map.set(alias, region)
      }
    }
  }
  return map
}

/**
 * Merge an inherited region map (parent) with a child's own (child). Child's
 * aliases override parent's on conflict; parent's default (`""`) is kept
 * unless the child also declares a default. Used by `followModules` to thread
 * the root's region map into child modules.
 */
export function mergeProviderRegions(
  parent: ProviderRegionMap | undefined,
  child: ProviderRegionMap | undefined,
): ProviderRegionMap {
  const out: ProviderRegionMap = new Map(parent ?? [])
  if (child) {
    for (const [alias, region] of child) out.set(alias, region)
  }
  return out
}

function mapIngressObj(o: unknown, scope: Scope): IngressRule {
  const oo = asObject(o)
  const raw = oo.cidr_blocks
  let cidrBlocks: NormalizedValue[]
  if (Array.isArray(raw)) {
    cidrBlocks = raw.map((c) => resolveValue(c, scope))
  } else if (typeof raw === 'string') {
    // A whole-list reference, e.g. `cidr_blocks = var.allowed_cidrs`
    // (common in modules). Follow it to a concrete list; if it can't be
    // resolved, keep it as one unresolved element so the check honestly
    // degrades to "could not evaluate" instead of silently passing.
    const resolved = resolveRaw(raw, scope)
    cidrBlocks = Array.isArray(resolved)
      ? resolved.map((c) => resolveValue(c, scope))
      : [{ kind: 'unresolved', expr: raw }]
  } else {
    cidrBlocks = []
  }
  return {
    fromPort: resolveValue(oo.from_port, scope),
    toPort: resolveValue(oo.to_port, scope),
    cidrBlocks,
  }
}

/** Inline `<name> { ... }` blocks (name is 'ingress' or 'egress'). */
function inlineBlocks(
  block: Record<string, unknown>,
  name: string,
  scope: Scope,
): IngressRule[] {
  const raw = block[name]
  return Array.isArray(raw) ? raw.map((i) => mapIngressObj(i, scope)) : []
}

/** Follow a sole var/local/each reference to its raw resolved value. */
export function resolveRaw(
  raw: unknown,
  scope: Scope,
  depth = 8,
): unknown | undefined {
  if (typeof raw === 'string') {
    const m = SOLE_REF.exec(raw)
    if (m) {
      const key = soleRefKey(m)
      if (depth > 0 && scope.has(key))
        return resolveRaw(scope.get(key), scope, depth - 1)
      return undefined
    }
    if (isInterpolated(raw)) return undefined // compound expr / function call
  }
  return raw
}

/**
 * Resolve a `count` against scope to decide if a resource/module is disabled.
 * A literal 0 (or a var/local that resolves to it) → disabled, no instances;
 * dotzen skips it silently (no skip note — it is correct, not a gap). Any
 * compound expression (`var.x ? 0 : 1`) does not resolve → false → follow once
 * honestly. Shared by resource-level (`normalize`) and module-level
 * (`followModules`) count handling.
 */
export const countIsZero = (count: unknown, scope: Scope): boolean => {
  const resolved = typeof count === 'string' ? resolveRaw(count, scope) : count
  return resolved === 0
}

/**
 * Whether a `for_each` collection resolves to EMPTY → zero instances → skip
 * silently (same intent-not-gap rationale as `count = 0`). Returns false for:
 *  - no `for_each` (undefined) — a normal single-instance resource.
 *  - an UNRESOLVABLE for_each (`toset([...])` / a var with no default / a
 *    function call) — follow once honestly, matching module-level behavior;
 *    the engine degrades dependent checks to could-not-evaluate. (Note: a
 *    literal `toset([])` is a function call dotzen cannot see inside, so it
 *    is treated as unresolvable and followed once — a known limitation,
 *    identical to module `for_each` handling.)
 */
export function forEachIsEmpty(forEach: unknown, scope: Scope): boolean {
  if (forEach === undefined) return false
  // Literal object map → empty when it has no keys.
  if (forEach && typeof forEach === 'object' && !Array.isArray(forEach))
    return Object.keys(forEach as Record<string, unknown>).length === 0
  // Literal array → empty when length 0.
  if (Array.isArray(forEach)) return forEach.length === 0
  // Reference: `${var.x}` / `${local.x}` → resolveRaw to a literal collection.
  if (typeof forEach === 'string') {
    const resolved = resolveRaw(forEach, scope)
    if (Array.isArray(resolved)) return resolved.length === 0
    if (resolved && typeof resolved === 'object')
      return Object.keys(resolved as Record<string, unknown>).length === 0
    return false // unresolvable → follow once
  }
  return false
}

/** A single `for_each` element to expand a module/resource block over. */
export interface ForEachElement {
  /** Stringified element key — list index, set element, or map key. */
  readonly key: string
  /** Raw element value (threaded into the scope as `each.value`). */
  readonly value: unknown
}

/**
 * Resolve a `for_each` to the per-element expansion. Shared by module-level
 * (`followModules`) and resource-level (`normalize`) for_each handling.
 * Returns:
 *  - `null`  → no `for_each`: one iteration, no `each.*` bindings.
 *  - `[]`    → `for_each = toset([])` / empty literal — no instances (silent).
 *  - `[{…}]` → one entry per element; `each.value` / `each.key` get threaded.
 *  - `[{key: '?'}]` (single, key '?') → unresolvable; follow once honestly
 *    without `each.*` (the engine degrades dependent checks to
 *    could-not-evaluate). Distinguishable from a real one-element set by the
 *    synthetic key '?' used only on the unresolvable path.
 */
export function expandForEach(
  forEach: unknown,
  scope: Scope,
): ForEachElement[] | null {
  if (forEach === undefined) return null
  // Literal object map — hcl2json yields a plain object.
  if (forEach && typeof forEach === 'object' && !Array.isArray(forEach)) {
    return Object.entries(forEach as Record<string, unknown>).map(
      ([key, value]) => ({ key, value }),
    )
  }
  // Literal array / a var-resolved list — treated like `toset(...)`:
  // each.key = each.value = the element (Terraform's for_each-over-set rule).
  if (Array.isArray(forEach)) {
    return forEach.map((value) => ({ key: String(value), value }))
  }
  // Reference: `${var.x}` / `${local.x}` → resolveRaw to a literal collection.
  if (typeof forEach === 'string') {
    const resolved = resolveRaw(forEach, scope)
    if (Array.isArray(resolved)) {
      return resolved.map((value) => ({ key: String(value), value }))
    }
    if (resolved && typeof resolved === 'object') {
      return Object.entries(resolved as Record<string, unknown>).map(
        ([key, value]) => ({ key, value }),
      )
    }
    // Unresolvable (no default, or a `toset(...)`/function-call compound) →
    // follow once honestly, no `each.*` bindings.
    return [{ key: '?', value: undefined }]
  }
  return [{ key: '?', value: undefined }]
}

/** Substitute `<iterator>.value[.field]` references with the element value. */
function substituteValue(v: unknown, iterator: string, el: unknown): unknown {
  if (typeof v === 'string') {
    const it = escapeRegExp(iterator)
    const field = new RegExp(
      `^\\$\\{${it}\\.value\\.([A-Za-z0-9_-]+)\\}$`,
    ).exec(v)
    if (field) return asObject(el)[field[1] as string]
    if (v === `\${${iterator}.value}`) return el
    return v
  }
  if (Array.isArray(v)) return v.map((x) => substituteValue(x, iterator, el))
  return v
}

const substituteIterator = (
  content: Record<string, unknown>,
  iterator: string,
  el: unknown,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(content))
    out[k] = substituteValue(v, iterator, el)
  return out
}

/**
 * `dynamic "ingress" { content { ... } }` blocks. When the `for_each`
 * collection resolves (via scope) to a concrete list/map of literals, the
 * block is EXPANDED — one ingress per element, with `<iterator>.value`
 * references substituted — so it yields a definite verdict. When the
 * collection cannot be resolved (a var without default, a `toset(...)` or
 * other function call, `each.*`), the content is kept as-is with its
 * values unresolved, correctly yielding "could not evaluate".
 */
function dynamicBlocks(
  block: Record<string, unknown>,
  name: string,
  scope: Scope,
): IngressRule[] {
  const dyn = block.dynamic
  if (!dyn || typeof dyn !== 'object') return []
  const ing = (dyn as Record<string, unknown>)[name]
  if (!Array.isArray(ing)) return []

  const out: IngressRule[] = []
  for (const d of ing) {
    const dobj = asObject(d)
    const contents = Array.isArray(dobj.content) ? dobj.content : []
    const iterator = typeof dobj.iterator === 'string' ? dobj.iterator : name
    const collection = resolveRaw(dobj.for_each, scope)
    const elements = Array.isArray(collection)
      ? collection
      : collection && typeof collection === 'object'
        ? Object.values(collection)
        : undefined

    if (elements) {
      for (const el of elements)
        for (const c of contents)
          out.push(
            mapIngressObj(substituteIterator(asObject(c), iterator, el), scope),
          )
    } else {
      for (const c of contents) out.push(mapIngressObj(c, scope))
    }
  }
  return out
}

/** A standalone `aws_vpc_security_group_ingress_rule` is itself one rule. */
function ruleResourceIngress(
  block: Record<string, unknown>,
  scope: Scope,
): IngressRule[] {
  const cidrs: unknown[] = []
  if (block.cidr_ipv4 !== undefined) cidrs.push(block.cidr_ipv4)
  if (block.cidr_ipv6 !== undefined) cidrs.push(block.cidr_ipv6)
  return [
    {
      fromPort: resolveValue(block.from_port, scope),
      toPort: resolveValue(block.to_port, scope),
      cidrBlocks: cidrs.map((c) => resolveValue(c, scope)),
    },
  ]
}

/** A literal (non-interpolated) string, or undefined. */
const litStr = (v: unknown): string | undefined =>
  typeof v === 'string' && !isInterpolated(v) ? v : undefined

// Azure "any source" sentinels — all mean the public internet. Normalized
// to the CIDR the cloud-neutral `denyIngress` already recognizes.
const AZURE_ANY_SOURCE = new Set(['*', 'Internet', '0.0.0.0/0'])

/** Parse a port spec ("22", "*", "80-90") to a pair (Azure + GCP share this). */
function parsePortRange(r: string): { from: number; to: number } | undefined {
  if (r === '*') return { from: 0, to: 65535 }
  const dash = r.split('-')
  if (dash.length === 2) {
    const a = Number(dash[0])
    const b = Number(dash[1])
    if (Number.isFinite(a) && Number.isFinite(b)) return { from: a, to: b }
    return undefined
  }
  const n = Number(r)
  return Number.isFinite(n) ? { from: n, to: n } : undefined
}

/**
 * Map one Azure NSG rule to the cloud-neutral ingress model. Only
 * `Inbound` + `Allow` rules are ingress; a `*`/`Internet` source becomes
 * `0.0.0.0/0` so the shared `denyIngress` condition works unchanged.
 */
function azureRuleToIngress(
  o: Record<string, unknown>,
  scope: Scope,
): IngressRule[] {
  if (litStr(o.direction) !== 'Inbound' || litStr(o.access) !== 'Allow')
    return []

  const srcRaw = o.source_address_prefixes ?? o.source_address_prefix
  const sources = (Array.isArray(srcRaw) ? srcRaw : [srcRaw]).filter(
    (s) => s !== undefined,
  )
  const cidrBlocks = sources.map((s): NormalizedValue => {
    const v = resolveValue(s, scope)
    return v.kind === 'literal' &&
      typeof v.value === 'string' &&
      AZURE_ANY_SOURCE.has(v.value)
      ? { kind: 'literal', value: '0.0.0.0/0' }
      : v
  })

  const portRaw = o.destination_port_ranges ?? o.destination_port_range
  const ports = Array.isArray(portRaw) ? portRaw : [portRaw]
  return ports.map((p): IngressRule => {
    const s = litStr(p)
    const pair = s !== undefined ? parsePortRange(s) : undefined
    if (pair)
      return {
        fromPort: { kind: 'literal', value: pair.from },
        toPort: { kind: 'literal', value: pair.to },
        cidrBlocks,
      }
    const un = resolveValue(p, scope)
    return { fromPort: un, toPort: un, cidrBlocks }
  })
}

/**
 * Map a `google_compute_firewall` to the cloud-neutral ingress model. Only
 * INGRESS direction (the default) counts; each `allow { protocol, ports }`
 * block becomes ingress rules over `source_ranges`. An allow block with no
 * ports means every port (0–65535).
 */
function gcpFirewallToIngress(
  block: Record<string, unknown>,
  scope: Scope,
): IngressRule[] {
  const direction = litStr(block.direction) ?? 'INGRESS'
  if (direction !== 'INGRESS') return []

  const srcRaw = Array.isArray(block.source_ranges) ? block.source_ranges : []
  const cidrBlocks = srcRaw.map((s) => resolveValue(s, scope))

  const allows = Array.isArray(block.allow) ? block.allow : []
  const out: IngressRule[] = []
  for (const a of allows) {
    const ao = asObject(a)
    const ports = Array.isArray(ao.ports) ? ao.ports : []
    if (ports.length === 0) {
      out.push({
        fromPort: { kind: 'literal', value: 0 },
        toPort: { kind: 'literal', value: 65535 },
        cidrBlocks,
      })
      continue
    }
    for (const p of ports) {
      const s = litStr(p)
      const pair = s !== undefined ? parsePortRange(s) : undefined
      if (pair)
        out.push({
          fromPort: { kind: 'literal', value: pair.from },
          toPort: { kind: 'literal', value: pair.to },
          cidrBlocks,
        })
      else {
        const un = resolveValue(p, scope)
        out.push({ fromPort: un, toPort: un, cidrBlocks })
      }
    }
  }
  return out
}

function ingressFor(
  type: string,
  block: Record<string, unknown> | undefined,
  scope: Scope,
): IngressRule[] {
  if (!block) return []
  if (type === AwsResource.VpcSecurityGroupIngressRule)
    return ruleResourceIngress(block, scope)
  if (type === AzureResource.NetworkSecurityRule)
    return azureRuleToIngress(block, scope)
  if (type === AzureResource.NetworkSecurityGroup) {
    const rules = Array.isArray(block.security_rule) ? block.security_rule : []
    return rules.flatMap((r) => azureRuleToIngress(asObject(r), scope))
  }
  if (type === GcpResource.ComputeFirewall)
    return gcpFirewallToIngress(block, scope)
  return [
    ...inlineBlocks(block, 'ingress', scope),
    ...dynamicBlocks(block, 'ingress', scope),
  ]
}

function egressFor(
  block: Record<string, unknown> | undefined,
  scope: Scope,
): IngressRule[] {
  if (!block) return []
  return [
    ...inlineBlocks(block, 'egress', scope),
    ...dynamicBlocks(block, 'egress', scope),
  ]
}

// Object-literal keys (`ident = …`) in an HCL expression string. A single
// `=` (not `==`/`>=`/etc.) is HCL's attribute-assignment operator, so this
// reliably picks up flat map keys inside a `merge(...)` argument.
const OBJECT_KEY = /([A-Za-z_][A-Za-z0-9_-]*)\s*=(?!=)/g
// A whole argument that is exactly one `var.x` / `local.y` ref (optionally
// `${…}`-wrapped). Only such TOP-LEVEL merge args contribute tag keys — refs
// inside an object literal's *values* (e.g. `Ou = var.ou`) must not count.
const ARG_REF = /^\$?\{?\s*(var|local)\.([A-Za-z0-9_-]+)\s*\}?$/

/** The substring inside the outermost `merge( … )`, or null if unbalanced. */
function mergeInner(value: string): string | null {
  const m = /^merge\s*\(/.exec(value)
  if (!m) return null
  let depth = 0
  const start = m[0].length
  for (let i = start; i < value.length; i++) {
    const c = value[i]
    if (c === '(') depth++
    else if (c === ')') {
      if (depth === 0) return value.slice(start, i)
      depth--
    }
  }
  return null
}

/** Split an argument list on top-level commas, respecting (), {}, [], quotes. */
function splitTopLevelArgs(inner: string): string[] {
  const args: string[] = []
  let depth = 0
  let start = 0
  let quote: string | null = null
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]
    if (quote) {
      if (c === quote && inner[i - 1] !== '\\') quote = null
    } else if (c === '"' || c === "'") quote = c
    else if (c === '(' || c === '{' || c === '[') depth++
    else if (c === ')' || c === '}' || c === ']') depth--
    else if (c === ',' && depth === 0) {
      args.push(inner.slice(start, i))
      start = i + 1
    }
  }
  args.push(inner.slice(start))
  return args.map((a) => a.trim()).filter((a) => a.length > 0)
}

/**
 * Keys known to be present on a tags value, and whether that set is
 * COMPLETE. Follows sole `var`/`local` references to their value, and
 * unions the literal keys (and resolvable refs) inside a `merge(...)`.
 * Returns `null` when nothing can be determined (an unresolvable reference
 * or an opaque expression) — which becomes "could not evaluate".
 */
function tagKeys(
  value: unknown,
  scope: Scope,
  depth = 8,
): { keys: string[]; complete: boolean } | null {
  if (value === undefined) return { keys: [], complete: true }
  if (value && typeof value === 'object' && !Array.isArray(value))
    return { keys: Object.keys(value), complete: true }
  if (typeof value !== 'string') return null

  const ref = SOLE_REF.exec(value) // exactly one ${var.x} / ${local.y}
  if (ref) {
    if (depth <= 0) return null
    const key = `${ref[1]}.${ref[2]}`
    return scope.has(key) ? tagKeys(scope.get(key), scope, depth - 1) : null
  }

  // Only treat `merge(...)` as the TOP-LEVEL call (strip a `${…}` wrapper
  // first). merge nested inside another function is opaque → could-not-eval.
  const stripped = value.replace(/^\$\{/, '').replace(/\}$/, '').trim()
  if (/^merge\s*\(/.test(stripped)) {
    const inner = mergeInner(stripped)
    if (inner === null) return null
    // merge() only ADDS keys, so the result is COMPLETE iff every top-level
    // argument is fully knowable: an object literal, or a ref that resolves
    // to a complete map. An unresolvable ref or an opaque expression (e.g. a
    // function call) means more keys could appear → PARTIAL, so a missing
    // required tag degrades to could-not-evaluate rather than a false claim.
    const keys = new Set<string>()
    let complete = true
    for (const arg of splitTopLevelArgs(inner)) {
      const refMatch = ARG_REF.exec(arg)
      if (arg.startsWith('{')) {
        // Object literal: keys are the `ident =` pairs (tag maps are flat);
        // the values — which may themselves mention refs — are irrelevant.
        for (const m of arg.match(OBJECT_KEY) ?? [])
          keys.add(m.replace(/\s*=$/, ''))
      } else if (refMatch) {
        const scopeKey = `${refMatch[1]}.${refMatch[2]}`
        const sub =
          depth > 0 && scope.has(scopeKey)
            ? tagKeys(scope.get(scopeKey), scope, depth - 1)
            : null
        if (sub === null) {
          complete = false // unresolvable ref — could add unknown keys
        } else {
          // Proven-present keys count even from a partial sub (merge only
          // adds); a partial sub still means the whole set is incomplete.
          for (const k of sub.keys) keys.add(k)
          if (!sub.complete) complete = false
        }
      } else {
        complete = false // opaque arg (function call, etc.) may add keys
      }
    }
    return { keys: [...keys], complete }
  }

  return null // some other unresolvable expression
}

/**
 * The tag/map field a resource uses to carry its taxonomy: GCP resources
 * expose `labels`; AWS and Azure use `tags`. Used by tagsOf/environmentOf so
 * a GCP resource's labels feed `mustHaveTags` and environment scoping the same
 * way an AWS `tags` map does.
 */
const tagField = (type: string): string =>
  type.startsWith('google_') ? 'labels' : 'tags'

/**
 * Tags: a literal map (or a `var`/`local` reference resolved to one) gives
 * a complete key set; `merge(<literal>, var.tags)` gives a PARTIAL set
 * (known-present keys, may be more); anything else is unresolved. Provider
 * `default_tags`/`default_labels` (`pd`) merge in: their keys are guaranteed
 * present on the resource, so an otherwise-`unresolved` resource-tag map
 * upgrades to `partial` (a required tag supplied by the provider now PASSES
 * instead of degrading to could-not-evaluate), and `resolved`/`partial` sets
 * gain the provider keys. Resource-level tags win on conflicts (Terraform
 * semantics) — but since `tagsOf` only tracks KEY PRESENCE, conflict resolution
 * is irrelevant here; the union of keys is correct.
 */
function tagsOf(
  type: string,
  block: Record<string, unknown> | undefined,
  scope: Scope,
  pd?: ProviderDefaults,
): TagsInfo {
  const r = tagKeys(block?.[tagField(type)], scope)
  const pdKeys = pd?.tagKeys ?? []
  if (r === null) {
    // Resource tags unresolvable — but provider defaults may still supply
    // the required key(s). Upgrade to `partial` with the proven-present
    // provider keys (absence is NOT provable → honest degradation preserved).
    return pdKeys.length > 0
      ? { kind: 'partial', keys: pdKeys }
      : { kind: 'unresolved' }
  }
  const keys = pdKeys.length > 0 ? [...new Set([...r.keys, ...pdKeys])] : r.keys
  return r.complete ? { kind: 'resolved', keys } : { kind: 'partial', keys }
}

/**
 * Resolved value of the `environment` tag (for rule scoping), if present.
 * Precedence: the resource's own `environment` tag wins; otherwise fall back
 * to the provider `default_tags`/`default_labels` value for `environment`
 * (a resource with no tags but a provider-level `environment = "prod"` is
 * still scoping-correct). `environmentOverride` (a root's declared
 * environment) is applied by the caller and wins over both.
 */
function environmentOf(
  type: string,
  block: Record<string, unknown> | undefined,
  scope: Scope,
  pd?: ProviderDefaults,
): NormalizedValue | undefined {
  const t = block?.[tagField(type)]
  if (t && typeof t === 'object' && !Array.isArray(t)) {
    const env = (t as Record<string, unknown>).environment
    if (env !== undefined) return resolveValue(env, scope)
  }
  // Fall back to the provider default for `environment`, if any.
  const pdEnv = pd?.tagValues.environment
  return pdEnv === undefined ? undefined : resolveValue(pdEnv, scope)
}

// Blocks handled elsewhere (ingress/egress) or as tags — not attributes.
// Blocks handled elsewhere (ingress/egress) or as tags — not attributes.
// NOTE: `dynamic` is NOT here — it is expanded by `expandDynamicInto` inside
// `collect` (for any named block EXCEPT the ones in this set, which have
// dedicated extractors: ingress/egress → `dynamicBlocks`/`inlineBlocks`,
// tags → `tagsOf`). A `dynamic "settings" { for_each = … content { … } }`
// on an App Service / GCP resource is expanded into `settings.*` attributes
// so `mustHaveBlock`/`denyBlockPresence` and attribute rules see its content.
const NON_ATTR_BLOCKS = new Set(['ingress', 'egress', 'tags'])

// Top-level resource meta-arguments (not real attributes): `count`/`for_each`
// control instantiation, `depends_on` is a graph hint, `provider` picks a
// provider config. Excluded from attribute harvesting so they don't leak as
// pseudo-attributes on active resources. `lifecycle` is NOT here — it's a
// nested block (`lifecycle { prevent_destroy = true }`) and IS harvested as
// `lifecycle.*` so rules can target it.
const RESOURCE_META = new Set(['count', 'for_each', 'depends_on', 'provider'])

// hcl2json represents a nested block as an array of one object.
const isNestedBlock = (v: unknown): v is [Record<string, unknown>] =>
  Array.isArray(v) &&
  v.length > 0 &&
  typeof v[0] === 'object' &&
  v[0] !== null &&
  !Array.isArray(v[0])

interface Extracted {
  attributes: Record<string, NormalizedValue>
  lists: Record<string, ListInfo>
  blocks: string[]
}

/**
 * Expand `dynamic "<name>" { for_each = … content { … } }` blocks into
 * attributes, for any named block EXCEPT ingress/egress/tags (those have
 * dedicated extractors — `dynamicBlocks` produces IngressRules, `tagsOf`
 * reads the tags map; expanding them here would duplicate). When the
 * `for_each` collection resolves (via scope) to a concrete list/map of
 * literals, the content is EXPANDED — one copy per element, with
 * `<iterator>.value` references substituted — so it yields definite attribute
 * values. When the collection is UNRESOLVABLE (a var without default, a
 * `toset(...)`/function call), the content is kept once as-is with its values
 * unresolved, correctly yielding "could not evaluate" (matching the
 * ingress/egress dynamic-block behavior). The block path is recorded so
 * `mustHaveBlock`/`denyBlockPresence` see the (dynamically-generated) block.
 */
function expandDynamicInto(
  prefix: string,
  dyn: unknown,
  scope: Scope,
  out: Extracted,
): void {
  if (!dyn || typeof dyn !== 'object' || Array.isArray(dyn)) return
  // hcl2json: `dynamic: { <name>: [ { for_each, content, iterator }, ... ] }`.
  for (const [name, entries] of Object.entries(
    dyn as Record<string, unknown>,
  )) {
    // ingress/egress/tags have dedicated extractors — skip to avoid dupes.
    if (NON_ATTR_BLOCKS.has(name)) continue
    const blockPrefix = prefix ? `${prefix}.${name}` : name
    for (const entry of Array.isArray(entries) ? entries : []) {
      const dobj = asObject(entry)
      const contents = Array.isArray(dobj.content) ? dobj.content : []
      if (contents.length === 0) continue
      const iterator = typeof dobj.iterator === 'string' ? dobj.iterator : name
      const collection = resolveRaw(dobj.for_each, scope)
      const elements = Array.isArray(collection)
        ? collection
        : collection && typeof collection === 'object'
          ? Object.values(collection)
          : undefined
      // Record the block path — the dynamic block generates `<name>` (per
      // element), so it IS present for mustHaveBlock/denyBlockPresence.
      out.blocks.push(blockPrefix)
      if (elements) {
        for (const el of elements)
          for (const c of contents)
            collect(
              blockPrefix,
              substituteIterator(asObject(c), iterator, el),
              scope,
              out,
            )
      } else {
        // Unresolvable for_each → keep content once, values unresolved (honest).
        for (const c of contents) collect(blockPrefix, asObject(c), scope, out)
      }
    }
  }
}

/**
 * Extract scalar attributes and list-valued attributes from a block,
 * recursing through nested blocks and flattening to dotted keys
 * (`vpc_config { public_access_cidrs = [...] }` -> list
 * `vpc_config.public_access_cidrs`; `metadata_options { http_tokens = x }`
 * -> attribute `metadata_options.http_tokens`). Maps (tags) are skipped;
 * ingress/egress are handled elsewhere; `dynamic "<name>"` blocks are
 * expanded by `expandDynamicInto` (for any name except ingress/egress/tags).
 */
function collect(
  prefix: string,
  obj: Record<string, unknown>,
  scope: Scope,
  out: Extracted,
): void {
  for (const [k, v] of Object.entries(obj)) {
    if (v === null) continue
    // `dynamic` may appear at ANY nesting depth (e.g. a `dynamic` inside a
    // `network_interface` block), so handle it before the prefix-guarded skip.
    if (k === 'dynamic') {
      expandDynamicInto(prefix, v, scope, out)
      continue
    }
    if (prefix === '' && (NON_ATTR_BLOCKS.has(k) || RESOURCE_META.has(k)))
      continue
    const key = prefix ? `${prefix}.${k}` : k
    if (isNestedBlock(v)) {
      out.blocks.push(key) // record the block path (even if empty)
      collect(key, v[0], scope, out)
    } else if (Array.isArray(v)) {
      out.lists[key] = {
        kind: 'resolved',
        items: v.map((x) => resolveValue(x, scope)),
      }
    } else if (typeof v !== 'object') {
      out.attributes[key] = resolveValue(v, scope)
    }
  }
}

function extractAttrs(
  block: Record<string, unknown> | undefined,
  scope: Scope,
): Extracted {
  const out: Extracted = { attributes: {}, lists: {}, blocks: [] }
  if (block) collect('', block, scope, out)
  return out
}

const toStrList = (v: unknown): string[] => {
  if (typeof v === 'string') return [v]
  if (Array.isArray(v))
    return v.filter((x): x is string => typeof x === 'string')
  return []
}

/**
 * Sentinel for an unresolvable HCL value (a `var.x`/`local.y`/`data.x`
 * reference, a function call, or any expression the literal parser cannot
 * structurally evaluate). Propagates up through `parseHclValue` so the
 * caller degrades the whole policy/containers to `kind: 'unresolved'`.
 */
const UNRESOLVED: unique symbol = Symbol('unresolved')

/**
 * Split an HCL object/array body on top-level commas AND newlines. HCL
 * object literals use either (or both) as entry separators, so a pure
 * comma splitter (like `splitTopLevelArgs`) would miss newline-separated
 * entries — e.g. the multi-line `jsonencode({\n  Version = ...\n  Statement
 * = ...\n})` shape that hcl2json emits. Tracks `()`/`{}`/`[]` nesting and
 * quotes so commas/newlines inside nested structures or strings do not split.
 */
function splitTopLevelEntries(inner: string): string[] {
  const entries: string[] = []
  let depth = 0
  let start = 0
  let quote: string | null = null
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]
    if (quote) {
      if (c === quote && inner[i - 1] !== '\\') quote = null
    } else if (c === '"' || c === "'") quote = c
    else if (c === '(' || c === '{' || c === '[') depth++
    else if (c === ')' || c === '}' || c === ']') depth--
    else if (depth === 0 && (c === ',' || c === '\n')) {
      const entry = inner.slice(start, i).trim()
      if (entry.length > 0) entries.push(entry)
      start = i + 1
    }
  }
  const last = inner.slice(start).trim()
  if (last.length > 0) entries.push(last)
  return entries
}

/**
 * Split a `key = value` entry on the first top-level `=` (not `==`). The key
 * may be a bare identifier or a quoted string (unquoted on return). Returns
 * null if no top-level `=` is found (malformed entry).
 */
function splitKeyVal(entry: string): { key: string; val: string } | null {
  let depth = 0
  let quote: string | null = null
  for (let i = 0; i < entry.length; i++) {
    const c = entry[i]
    if (quote) {
      if (c === quote && entry[i - 1] !== '\\') quote = null
    } else if (c === '"' || c === "'") quote = c
    else if (c === '(' || c === '{' || c === '[') depth++
    else if (c === ')' || c === '}' || c === ']') depth--
    else if (c === '=' && depth === 0 && entry[i + 1] !== '=') {
      const keyRaw = entry.slice(0, i).trim()
      const val = entry.slice(i + 1).trim()
      const kq = /^["'](.*)["']$/.exec(keyRaw)
      return { key: kq ? (kq[1] ?? keyRaw) : keyRaw, val }
    }
  }
  return null
}

/**
 * Find the matching closing bracket for an opening `{`/`[`/`(` at position
 * `open`, tracking nesting and quotes. Returns the index of the matching
 * close, or -1 if unbalanced.
 */
function matchBracket(s: string, open: number): number {
  const openCh = s[open]
  const closeCh = openCh === '{' ? '}' : openCh === '[' ? ']' : ')'
  let depth = 0
  let quote: string | null = null
  for (let i = open; i < s.length; i++) {
    const c = s[i]
    if (quote) {
      if (c === quote && s[i - 1] !== '\\') quote = null
    } else if (c === '"' || c === "'") quote = c
    else if (c === openCh) depth++
    else if (c === closeCh) {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * Parse a quoted HCL string literal (double or single quotes). Handles `\"`
 * / `\\` escapes. If the string contains a `${...}` interpolation:
 *  - non-lenient (default): returns UNRESOLVED (the value is not statically
 *    knowable — used by `policyOf` where exact values matter, e.g. `Action: "*"`).
 *  - lenient: keeps the `${...}` in the output string (used by `containersOf`
 *    where we need to distinguish literal vs reference env var values without
 *    degrading the whole container_definitions to could-not-evaluate).
 */
function parseHclString(
  s: string,
  lenient = false,
): string | typeof UNRESOLVED {
  const quote = s[0]
  if (quote !== '"' && quote !== "'") return UNRESOLVED
  let out = ''
  for (let i = 1; i < s.length; i++) {
    const c = s[i]
    if (c === '\\' && i + 1 < s.length) {
      const next = s[i + 1]
      if (next === '"' || next === '\\' || next === "'") {
        out += next
        i++
        continue
      }
      out += c
      continue
    }
    if (c === quote) return out
    if (c === '$' && s[i + 1] === '{') {
      if (!lenient) return UNRESOLVED
      // In lenient mode, keep ${...} in the string so the caller can
      // detect it via isInterpolated() and treat it as a reference.
    }
    out += c
  }
  return UNRESOLVED // unterminated
}

/**
 * Recursively parse an HCL literal expression (the inner argument of
 * `jsonencode(...)`) into a JS value. Handles:
 *  - quoted strings (with escapes; interpolated strings → UNRESOLVED in
 *    non-lenient mode, kept as-is in lenient mode)
 *  - object literals `{ k = v, ... }` (comma or newline separated)
 *  - array literals `[ ... ]` (comma or newline separated)
 *  - booleans (`true`/`false`), `null`, numbers
 *  - bare identifiers / function calls / refs → UNRESOLVED
 * Returns UNRESOLVED if any value (at any depth) is not statically knowable,
 * so the caller degrades the whole policy/containers to could-not-evaluate
 * rather than guessing. In lenient mode, interpolated strings are kept
 * (not UNRESOLVED) so `containersOf` can extract env vars from mixed
 * literal/reference configs without degrading the whole thing.
 */
function parseHclValue(
  inner: string,
  lenient = false,
): unknown | typeof UNRESOLVED {
  const s = inner.trim()
  if (s.length === 0) return UNRESOLVED

  // Quoted string
  if (s[0] === '"' || s[0] === "'") {
    const v = parseHclString(s, lenient)
    return v === UNRESOLVED ? UNRESOLVED : v
  }

  // Object literal
  if (s[0] === '{') {
    const close = matchBracket(s, 0)
    if (close === -1) return UNRESOLVED
    const body = s.slice(1, close)
    const obj: Record<string, unknown> = {}
    for (const entry of splitTopLevelEntries(body)) {
      const kv = splitKeyVal(entry)
      if (!kv) return UNRESOLVED
      const v = parseHclValue(kv.val, lenient)
      if (v === UNRESOLVED) return UNRESOLVED
      obj[kv.key] = v
    }
    return obj
  }

  // Array literal
  if (s[0] === '[') {
    const close = matchBracket(s, 0)
    if (close === -1) return UNRESOLVED
    const body = s.slice(1, close)
    const arr: unknown[] = []
    for (const el of splitTopLevelEntries(body)) {
      const v = parseHclValue(el, lenient)
      if (v === UNRESOLVED) return UNRESOLVED
      arr.push(v)
    }
    return arr
  }

  // Booleans / null
  if (s === 'true') return true
  if (s === 'false') return false
  if (s === 'null') return null

  // Number
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s)

  // Anything else (var.x, local.y, data.x, function calls, bare identifiers,
  // compound expressions) is not statically knowable.
  return UNRESOLVED
}

/**
 * Extract the inner HCL expression from a `${jsonencode(<expr>)}` string.
 * Returns null if the string is not a jsonencode call (e.g. a bare `${var.x}`
 * or `${merge(...)}`). Handles multi-line input (hcl2json preserves newlines
 * inside the `${...}` wrapper) by matching balanced `()` after stripping the
 * outer `${...}` wrapper.
 */
function jsonencodeInner(raw: string): string | null {
  // Strip the ${...} wrapper if present (hcl2json wraps function calls).
  const stripped = raw.replace(/^\$\{/, '').replace(/\}$/, '')
  const m = /^jsonencode\s*\(/.exec(stripped)
  if (!m) return null
  let depth = 0
  const start = m[0].length
  for (let i = start; i < stripped.length; i++) {
    const c = stripped[i]
    if (c === '(') depth++
    else if (c === ')') {
      if (depth === 0) return stripped.slice(start, i).trim()
      depth--
    }
  }
  return null
}

/**
 * Extract the `Principal` field from a parsed statement — all string values
 * flattened into a list (a bare `"*"` → `["*"]`; `{ "AWS": "*" }` → `["*"]`;
 * `{ "AWS": ["arn:...", "*"] }` → `["arn:...", "*"]`). Empty `[]` when absent.
 */
function principalOf(so: Record<string, unknown>): string[] {
  const p = so.Principal
  if (typeof p === 'string') return [p]
  if (p && typeof p === 'object' && !Array.isArray(p)) {
    const out: string[] = []
    for (const v of Object.values(p as Record<string, unknown>))
      out.push(...toStrList(v))
    return out
  }
  return []
}

/** Extract a `Condition` block from a parsed statement object. */
function conditionsOf(
  so: Record<string, unknown>,
): Record<string, Record<string, string[]>> {
  const cond = so.Condition
  if (!cond || typeof cond !== 'object' || Array.isArray(cond)) return {}
  const out: Record<string, Record<string, string[]>> = {}
  for (const [op, val] of Object.entries(cond as Record<string, unknown>)) {
    if (!val || typeof val !== 'object' || Array.isArray(val)) continue
    const opMap: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(val as Record<string, unknown>))
      opMap[k] = toStrList(v)
    out[op] = opMap
  }
  return out
}

/**
 * Parse an IAM `policy` argument. A literal JSON document (heredoc/inline
 * string) OR a `jsonencode(<HCL literal>)` expression is parsed into
 * statements; a `jsonencode(var.x)` / `local.x` / bare variable, or malformed
 * input, is `unresolved` (=> "could not evaluate").
 */
function policyOf(
  block: Record<string, unknown> | undefined,
): PolicyInfo | undefined {
  const raw = block?.policy
  if (typeof raw !== 'string') return undefined // no inline JSON policy

  let doc: unknown
  if (isInterpolated(raw)) {
    // Try jsonencode(<HCL literal>); fall back to unresolved for var/local/other.
    const inner = jsonencodeInner(raw)
    if (inner === null) return { kind: 'unresolved' }
    const parsed = parseHclValue(inner)
    if (parsed === UNRESOLVED) return { kind: 'unresolved' }
    doc = parsed
  } else {
    // Literal JSON (heredoc / inline string).
    try {
      doc = JSON.parse(raw)
    } catch {
      return { kind: 'unresolved' }
    }
  }

  const stmtRaw = asObject(doc).Statement
  const list = Array.isArray(stmtRaw) ? stmtRaw : stmtRaw ? [stmtRaw] : []
  const statements = list.map((s) => {
    const so = asObject(s)
    return {
      effect: typeof so.Effect === 'string' ? so.Effect : '',
      actions: toStrList(so.Action),
      resources: toStrList(so.Resource),
      notActions: toStrList(so.NotAction),
      principals: principalOf(so),
      conditions: conditionsOf(so),
    }
  })
  return { kind: 'parsed', statements }
}

/**
 * Parse ECS `container_definitions`. A literal-JSON array OR a
 * `jsonencode(<HCL array literal>)` expression is parsed into containers;
 * a `jsonencode(var.x)` / bare variable, or malformed input, is `unresolved`.
 *
 * Uses **lenient** parsing for `jsonencode(...)`: interpolated strings
 * (`${var.x}`) are kept as-is rather than degrading the whole document to
 * `unresolved`. This lets `denyPlaintextEnvSecrets` detect hardcoded secrets
 * in mixed configs (some env vars literal, some referenced). The
 * `privileged` field tracks whether it was interpolated (`privilegedUnresolved`)
 * so `denyPrivilegedContainers` can still degrade to could-not-evaluate.
 */
function containersOf(
  block: Record<string, unknown> | undefined,
): ContainerInfo | undefined {
  const raw = block?.container_definitions
  if (typeof raw !== 'string') return undefined

  let doc: unknown
  // Try literal JSON first (handles heredocs with ${...} inside string values,
  // which are valid JSON). Fall back to jsonencode with lenient parsing.
  try {
    doc = JSON.parse(raw)
  } catch {
    if (isInterpolated(raw)) {
      const inner = jsonencodeInner(raw)
      if (inner === null) return { kind: 'unresolved' }
      const parsed = parseHclValue(inner, true) // lenient — keep ${...}
      if (parsed === UNRESOLVED) return { kind: 'unresolved' }
      doc = parsed
    } else {
      return { kind: 'unresolved' }
    }
  }

  const arr = Array.isArray(doc) ? doc : []
  const containers = arr.map((c): ContainerDef => {
    const co = asObject(c)
    const priv = co.privileged
    // `privileged` should be boolean true/false. If it's a string (interpolated
    // in lenient mode), mark privilegedUnresolved so denyPrivilegedContainers
    // degrades to could-not-evaluate rather than treating it as false.
    const privUnresolved = typeof priv === 'string' && isInterpolated(priv)
    // Extract environment variables, marking each as literal or reference.
    const envRaw = co.environment
    const environment: EnvVar[] = Array.isArray(envRaw)
      ? envRaw.map((e) => {
          const eo = asObject(e)
          const name = typeof eo.name === 'string' ? eo.name : ''
          const value = typeof eo.value === 'string' ? eo.value : ''
          return { name, value, isLiteral: !isInterpolated(value) }
        })
      : []
    return {
      name: typeof co.name === 'string' ? co.name : '',
      privileged: priv === true,
      privilegedUnresolved: privUnresolved,
      environment,
    }
  })
  return { kind: 'parsed', containers }
}

/**
 * The map object at a dotted path inside a block, or null if absent / not a
 * literal map. Handles two hcl2json shapes: a top-level map attribute
 * (`app_settings = { ... }` → `{ app_settings: {KEY:...} }`, object) and a
 * nested-block-then-map path (`environment { variables = {...} }` →
 * `{ environment: [{ variables: {KEY:...} }] }`, array[1] of object). A
 * whole-map reference (`= var.x`) shows up as an interpolated string and is
 * NOT a literal map → the caller treats it as unresolved.
 */
function mapAt(
  block: Record<string, unknown>,
  path: string[],
): Record<string, unknown> | null {
  let cur: unknown = block
  for (const seg of path) {
    if (cur && typeof cur === 'object' && !Array.isArray(cur)) {
      const obj = cur as Record<string, unknown>
      const v = obj[seg]
      // Nested block: array of one object — descend into it.
      if (isNestedBlock(v)) cur = v[0]
      else cur = v
    } else return null
  }
  if (cur && typeof cur === 'object' && !Array.isArray(cur))
    return cur as Record<string, unknown>
  return null
}

/** true if a raw env-var value string is a `${...}` reference, not a literal. */
const envVarIsLiteral = (raw: unknown): boolean | undefined => {
  if (typeof raw === 'string') return !isInterpolated(raw)
  if (typeof raw === 'number' || typeof raw === 'boolean') return true
  return undefined // object/array/null — not a scalar env var; skip it
}

/**
 * Extract a serverless function's env-var map into EnvVar[] (for
 * `denyPlaintextEnvSecrets`). Returns undefined when the resource type has no
 * env-var map (rule passes), `unresolved` when the map is an unresolvable ref,
 * or `parsed` with the extracted vars. Map locations are per resource type:
 *  - aws_lambda_function: environment.variables
 *  - azurerm_*_function_app: app_settings
 *  - google_cloudfunctions2_function: service_config.environment_variables
 */
function envVarsOf(
  type: string,
  block: Record<string, unknown> | undefined,
  scope: Scope,
): EnvVarsInfo | undefined {
  let path: string[] | null = null
  if (type === AwsResource.LambdaFunction) path = ['environment', 'variables']
  else if (
    type === AzureResource.LinuxFunctionApp ||
    type === AzureResource.WindowsFunctionApp ||
    type === AzureResource.FunctionApp
  )
    path = ['app_settings']
  else if (type === GcpResource.Cloudfunctions2Function)
    path = ['service_config', 'environment_variables']
  if (!path || !block) return undefined

  // A whole-map reference (e.g. `app_settings = var.settings`) appears as an
  // interpolated string at the top-level segment, not a literal map.
  const top = block[path[0]!]
  if (typeof top === 'string' && isInterpolated(top))
    return { kind: 'unresolved' }

  const map = mapAt(block, path)
  if (map === null) return undefined // no env-var map declared → rule passes
  const vars: EnvVar[] = []
  for (const [name, raw] of Object.entries(map)) {
    const isLit = envVarIsLiteral(raw)
    if (isLit === undefined) continue // non-scalar value; skip
    // Resolve through scope so a `var.x` that bottoms out at a literal still
    // counts as a literal (matches ECS container env-var resolution).
    const resolved = resolveValue(raw, scope)
    const value =
      resolved.kind === 'literal'
        ? String(resolved.value)
        : (raw?.toString() ?? '')
    vars.push({ name, value, isLiteral: isLit })
  }
  return { kind: 'parsed', vars }
}

/**
 * Provisioner types declared on a resource (hcl2json shape:
 * `provisioner: { "local-exec": [{ … }], "remote-exec": [{ … }] }` — a map of
 * name → array-of-block-objects, like `dynamic`). Returns the declared type
 * names, sorted for stable output; empty array when none. `collect` drops
 * `provisioner` (it's an object, not a nested-block array), so this is the
 * sole extraction path.
 */
function provisionersOf(block: Record<string, unknown> | undefined): string[] {
  const p = block?.provisioner
  if (!p || typeof p !== 'object' || Array.isArray(p)) return []
  return Object.keys(p as Record<string, unknown>).sort()
}

const escapeRegExp = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Best-effort line of a `resource "type" "name"` block via text scan. */
function findLine(text: string, type: string, name: string): number {
  const lines = text.split(/\r?\n/)
  const needle = new RegExp(
    `resource\\s+"${escapeRegExp(type)}"\\s+"${escapeRegExp(name)}"`,
  )
  for (let i = 0; i < lines.length; i++) {
    if (needle.test(lines[i] ?? '')) return i + 1
  }
  return 1
}

/** Best-effort line of a `data "type" "name"` block via text scan. */
function findDataLine(text: string, type: string, name: string): number {
  const lines = text.split(/\r?\n/)
  const needle = new RegExp(
    `data\\s+"${escapeRegExp(type)}"\\s+"${escapeRegExp(name)}"`,
  )
  for (let i = 0; i < lines.length; i++) {
    if (needle.test(lines[i] ?? '')) return i + 1
  }
  return 1
}

/**
 * The provider alias a resource is pinned to (`provider = aws.dr` → "dr"), or
 * undefined for the default provider. hcl2json emits the value as
 * `${aws.dr}` (interpolated) — strip the wrapper and take the segment after
 * the dot. A bare `aws` (no dot) is the default provider → undefined.
 */
function providerAliasOf(
  block: Record<string, unknown> | undefined,
): string | undefined {
  const p = block?.provider
  if (typeof p !== 'string') return undefined
  const s = p.replace(/^\$\{|\}$/g, '').trim()
  const dot = s.indexOf('.')
  return dot === -1 ? undefined : s.slice(dot + 1)
}

/**
 * The Terraform provider NAME a resource type belongs to (the prefix before
 * the first `_`): `aws_*` / `data.aws_*` → "aws", `google_*` → "google",
 * `azurerm_*` → "azurerm". Used to apply a module-call `providers` map
 * remap to a child resource on the DEFAULT provider (no explicit `provider`
 * arg) — `providers = { aws = aws.dr }` means the child's default `aws`
 * resources run under the parent's `aws.dr` alias.
 */
const providerNameForType = (type: string): string | undefined => {
  const t = type.startsWith('data.') ? type.slice(5) : type
  if (t.startsWith('aws_')) return 'aws'
  if (t.startsWith('google_')) return 'google'
  if (t.startsWith('azurerm_')) return 'azurerm'
  return undefined
}

/**
 * Build ONE NormalizedResource from a single resource block. Shared by the
 * no-for_each path (one call) and the for_each-expansion path (one call per
 * element, with `each.*` threaded into a per-instance scope and `instanceKey`
 * set so violations distinguish instances). `scope` is the resolution scope
 * for this instance (the caller's scope, or a per-instance copy with
 * `each.key`/`each.value` set).
 */
function normalizeOne(
  type: string,
  name: string,
  block: Record<string, unknown> | undefined,
  file: string,
  line: number,
  scope: Scope,
  environmentOverride: string | undefined,
  pd: ProviderDefaults | undefined,
  instanceKey?: string,
  providerAlias?: string,
  providerRegion?: NormalizedValue,
): NormalizedResource {
  const extracted = extractAttrs(block, scope)
  return {
    type: type as AnyResource,
    name,
    file,
    line,
    instanceKey,
    providerAlias,
    providerRegion,
    ingress: ingressFor(type, block, scope),
    egress: egressFor(block, scope),
    tags: tagsOf(type, block, scope, pd),
    attributes: extracted.attributes,
    lists: extracted.lists,
    blocks: extracted.blocks,
    policy: policyOf(block),
    containers: containersOf(block),
    envVars: envVarsOf(type, block, scope),
    provisioners: provisionersOf(block),
    // Precedence: a root's declared environment wins over the resource's
    // own tag, which wins over the provider default (environmentOf).
    environment:
      environmentOverride !== undefined
        ? { kind: 'literal', value: environmentOverride }
        : environmentOf(type, block, scope, pd),
  }
}

/**
 * Adapter boundary (doc 06): parser output -> dotzen's own model.
 * The engine never sees `Hcl2JsonRoot`. `scope` resolves var/local refs.
 * `pd` (provider default_tags/default_labels) is threaded from `parseTf`/
 * `followModules` so a resource inherits its provider's tag defaults.
 *
 * Resource `for_each` (resolvable literal map/list, or a var resolving to
 * one) is EXPANDED per element — one NormalizedResource per instance, with
 * `each.key`/`each.value` threaded into a per-instance scope (so `each.*`
 * refs in attributes resolve to the element) and `instanceKey` set so
 * violations distinguish instances (`type.name[key]`). An UNRESOLVABLE
 * for_each (`toset(...)`, a var with no default) is followed once honestly
 * with no `each.*` bindings (dependent checks degrade to could-not-evaluate),
 * matching module-level for_each handling. `count = 0` / an empty for_each
 * collection yields zero instances (skipped silently — no false violation).
 */
export function normalize(
  parsed: Hcl2JsonRoot,
  file: string,
  rawText: string,
  scope: Scope = new Map(),
  environmentOverride?: string,
  pd?: ProviderDefaults,
  /** A module-call `providers = { aws = aws.dr }` remap, mapping a CHILD
   *  provider name → the PARENT alias. Applied to a child resource on the
   *  DEFAULT provider (no explicit `provider` arg): its inferred provider
   *  name is looked up here when `providerAliasOf(block)` is undefined.
   *  Undefined at the root (root resources aren't remapped). */
  providerAliasRemap?: Map<string, string>,
  /** A map of provider alias → region string (from `provider {}` blocks).
   *  Used to resolve a resource's `providerRegion` for GDPR/LGPD residency
   *  rules. Threaded through `followModules` so child modules inherit the
   *  root's region map. */
  regionMap?: ProviderRegionMap,
): NormalizedResource[] {
  const out: NormalizedResource[] = []
  const byType = parsed.resource ?? {}

  // Resolve a resource's provider alias: explicit `provider = aws.x` wins;
  // else, if a module-call remap covers the resource's inferred provider
  // name, the child default runs under that parent alias.
  const aliasFor = (
    type: string,
    block: Record<string, unknown> | undefined,
  ) => {
    const explicit = providerAliasOf(block)
    if (explicit !== undefined) return explicit
    if (!providerAliasRemap) return undefined
    const provName = providerNameForType(type)
    return provName ? providerAliasRemap.get(provName) : undefined
  }

  // Resolve a resource's provider region from its alias (or the default
  // provider if no explicit alias) using the region map. Returns a
  // NormalizedValue: a literal region string, or undefined if no region
  // is declared (the provider block has no `region` — degrades honestly).
  const regionFor = (
    alias: string | undefined,
  ): NormalizedValue | undefined => {
    if (!regionMap || regionMap.size === 0) return undefined
    const region = regionMap.get(alias ?? '')
    return region !== undefined ? { kind: 'literal', value: region } : undefined
  }

  for (const [type, byName] of Object.entries(byType)) {
    if (!KNOWN_TYPES.has(type)) continue
    for (const [name, blocks] of Object.entries(byName)) {
      const block = (Array.isArray(blocks) ? blocks[0] : blocks) as
        Record<string, unknown> | undefined
      // count = 0 (literal, or a var resolving to it) disables the resource —
      // there are no instances to evaluate; skip silently (no could-not-eval
      // gap, same rationale as module-level count=0 in followModules).
      if (block?.count !== undefined && countIsZero(block.count, scope))
        continue
      // for_each resolving to an EMPTY collection (literal [], {}, or a var
      // defaulting to one) → zero instances → skip silently. An UNRESOLVABLE
      // for_each (toset(...)/no-default var) is followed once honestly —
      // matching module behavior; dependent checks degrade to could-not-eval.
      if (
        block?.for_each !== undefined &&
        forEachIsEmpty(block.for_each, scope)
      )
        continue

      // No for_each → a single instance (the common case).
      if (block?.for_each === undefined) {
        out.push(
          normalizeOne(
            type,
            name,
            block,
            file,
            findLine(rawText, type, name),
            scope,
            environmentOverride,
            pd,
            undefined,
            aliasFor(type, block),
            regionFor(aliasFor(type, block)),
          ),
        )
        continue
      }

      // for_each present and non-empty → expand per element. `expandForEach`
      // never returns null here (for_each !== undefined) and never returns []
      // (forEachIsEmpty already returned for empty), so the array is non-empty.
      const elements = expandForEach(block.for_each, scope) ?? []
      for (const el of elements) {
        // Per-instance scope: copy the caller's scope so each.* bindings are
        // isolated to this instance (do NOT mutate the shared scope).
        const instScope = new Map(scope)
        // Synthetic '?' marks an UNRESOLVABLE for_each → follow once with no
        // each.* bindings and no instanceKey (one instance, honest).
        if (el.key !== '?' && el.key !== '') {
          instScope.set('each.value', el.value)
          instScope.set('each.key', el.key)
        }
        const instanceKey = el.key !== '' && el.key !== '?' ? el.key : undefined
        out.push(
          normalizeOne(
            type,
            name,
            block,
            file,
            findLine(rawText, type, name),
            instScope,
            environmentOverride,
            pd,
            instanceKey,
            aliasFor(type, block),
            regionFor(aliasFor(type, block)),
          ),
        )
      }
    }
  }

  // Data sources (`data "aws_ami" "x" {}`) — normalized as resources with
  // type `data.<t>` so the existing conditions govern them (e.g. an `aws_ami`
  // data source must declare `owners`). hcl2json shape mirrors `resource`.
  // No count/for_each expansion (data sources are single-instance queries);
  // no provider-alias scoping (a data source uses the provider of the module
  // it lives in — governed via the resource-side alias, not here).
  const byDataType = parsed.data ?? {}
  for (const [type, byName] of Object.entries(byDataType)) {
    const dataType = `data.${type}`
    if (!KNOWN_TYPES.has(dataType)) continue
    for (const [name, blocks] of Object.entries(byName)) {
      const block = (Array.isArray(blocks) ? blocks[0] : blocks) as
        Record<string, unknown> | undefined
      out.push(
        normalizeOne(
          dataType,
          name,
          block,
          file,
          findDataLine(rawText, type, name),
          scope,
          environmentOverride,
          pd,
          undefined,
          aliasFor(dataType, block),
          regionFor(aliasFor(dataType, block)),
        ),
      )
    }
  }

  return out
}

/** Best-effort line of an `output "name"` block via text scan. */
function findOutputLine(text: string, name: string): number {
  const lines = text.split(/\r?\n/)
  const needle = new RegExp(`output\\s+"${escapeRegExp(name)}"`)
  for (let i = 0; i < lines.length; i++) {
    if (needle.test(lines[i] ?? '')) return i + 1
  }
  return 1
}

/**
 * Normalize top-level `output` blocks. hcl2json: `output: { <name>: [{ value,
 * sensitive? }] }`. `value` is kept as a NormalizedValue (a literal or an
 * unresolved ref, expr preserved for secret-attr matching). `sensitive` is a
 * literal `true`/`false` (absent → false), or `'unresolved'` when it is a
 * var/local ref. Outputs are a separate surface from resources; the engine's
 * `denyInsensitiveSecretOutput` pass governs them.
 */
/**
 * Collect resources whose type is NOT in the closed vocabulary (`KNOWN_TYPES`)
 * — dotzen parsed them but cannot govern them. Surfaced as informational
 * telemetry so users know what's NOT covered (a silent skip is worse than an
 * honest gap). Returns `{type, name, file, line}` for each ungoverned
 * resource (data sources included). Does NOT normalize — just scans + filters.
 */
export function collectUngoverned(
  parsed: Hcl2JsonRoot,
  file: string,
  rawText: string,
): { type: string; name: string; file: string; line: number }[] {
  const out: { type: string; name: string; file: string; line: number }[] = []
  for (const [type, byName] of Object.entries(parsed.resource ?? {})) {
    if (KNOWN_TYPES.has(type)) continue
    // Utility types (random_*, terraform_data) have no security surface —
    // NOT a coverage gap to surface, just plumbing. Silently skipped per
    // ROADMAP #4 (a visible tag-noise report would be worse than silent).
    if (UTILITY_TYPES.has(type)) continue
    for (const name of Object.keys(byName)) {
      out.push({ type, name, file, line: findLine(rawText, type, name) })
    }
  }
  for (const [type, byName] of Object.entries(parsed.data ?? {})) {
    const dataType = `data.${type}`
    if (KNOWN_TYPES.has(dataType)) continue
    if (UTILITY_TYPES.has(type)) continue
    for (const name of Object.keys(byName)) {
      out.push({
        type: dataType,
        name,
        file,
        line: findDataLine(rawText, type, name),
      })
    }
  }
  return out
}

export function normalizeOutputs(
  parsed: Hcl2JsonRoot,
  file: string,
  rawText: string,
  scope: Scope,
): NormalizedOutput[] {
  const out: NormalizedOutput[] = []
  for (const [name, blocks] of Object.entries(parsed.output ?? {})) {
    const block = asObject(Array.isArray(blocks) ? blocks[0] : undefined)
    // Resolve through scope so a sole var/local ref to a secret bottoms out
    // at the resource-ref expr (the engine's secret matcher sees the real
    // attr, not the indirection). Compound / resource refs keep their expr.
    const value = resolveValue(block.value, scope)
    // bool literal → true/false; a ref → unresolved; absent → false.
    let sensitive: boolean | 'unresolved' = false
    if (block.sensitive === true || block.sensitive === false) {
      sensitive = block.sensitive
    } else if (block.sensitive !== undefined) {
      // A ref or compound expr — cannot statically resolve the flag.
      sensitive = 'unresolved'
    }
    out.push({
      name,
      file,
      line: findOutputLine(rawText, name),
      value,
      sensitive,
    })
  }
  return out
}

/** Whether a raw value is a plaintext scalar literal (not a `${ref}` nor a
 *  compound/object/array) — used to flag a local holding a hardcoded secret. */
function isScalarLiteral(v: unknown): boolean {
  if (typeof v === 'string') return !isInterpolated(v)
  return typeof v === 'number' || typeof v === 'boolean'
}

/** Best-effort line of a `variable "name"` block via text scan. */
function findVariableLine(text: string, name: string): number {
  const lines = text.split(/\r?\n/)
  const needle = new RegExp(`variable\\s+"${escapeRegExp(name)}"`)
  for (let i = 0; i < lines.length; i++) {
    if (needle.test(lines[i] ?? '')) return i + 1
  }
  return 1
}

/** Best-effort line of a `locals {` block (all entries share it — per-entry
 *  line would need block-interior scanning; best-effort, like findLine fallback). */
function findLocalsLine(text: string): number {
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*locals\s*\{/.test(lines[i] ?? '')) return i + 1
  }
  return 1
}

/**
 * Normalize the named-value bindings: `variable` blocks (carrying a
 * `sensitive` flag) and `locals` entries. A separate surface from resources
 * (like outputs) — `denyInsensitiveVariable` and `denyPlaintextLocalSecret`
 * govern them in the bindings eval pass. `sensitive` is a literal
 * true/false (absent → false) or `"unresolved"` (a var ref); `isLiteral` marks
 * a plaintext scalar value (the leak vector for locals secrets).
 */
export function normalizeBindings(
  parsed: Hcl2JsonRoot,
  file: string,
  rawText: string,
): NormalizedBinding[] {
  const out: NormalizedBinding[] = []
  for (const [name, blocks] of Object.entries(parsed.variable ?? {})) {
    const block = asObject(Array.isArray(blocks) ? blocks[0] : undefined)
    let sensitive: boolean | 'unresolved' = false
    if (block.sensitive === true || block.sensitive === false) {
      sensitive = block.sensitive
    } else if (block.sensitive !== undefined) {
      sensitive = 'unresolved'
    }
    out.push({
      kind: 'variable',
      name,
      file,
      line: findVariableLine(rawText, name),
      sensitive,
      isLiteral: isScalarLiteral(block.default),
    })
  }
  if (Array.isArray(parsed.locals)) {
    const line = findLocalsLine(rawText)
    for (const block of parsed.locals) {
      for (const [name, value] of Object.entries(asObject(block))) {
        out.push({
          kind: 'local',
          name,
          file,
          line,
          sensitive: false,
          isLiteral: isScalarLiteral(value),
        })
      }
    }
  }
  return out
}

/** Best-effort line of a `terraform {` block. */
function findTerraformLine(text: string): number {
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*terraform\s*\{/.test(lines[i] ?? '')) return i + 1
  }
  return 1
}

/**
 * Normalize the top-level `terraform {}` settings block: `required_version`
 * (the TF engine constraint string) and `required_providers` (per-provider
 * `{ name, version }` constraints). A separate surface; version-pinning rules
 * govern it. Returns at most one entry (one `terraform` block per dir; extra
 * blocks merge into the first in HCL — dotzen reads the first).
 */
export function normalizeSettings(
  parsed: Hcl2JsonRoot,
  file: string,
  rawText: string,
): NormalizedTerraformSettings[] {
  if (!Array.isArray(parsed.terraform) || parsed.terraform.length === 0)
    return []
  const block = asObject(parsed.terraform[0])
  const requiredVersion =
    typeof block.required_version === 'string'
      ? block.required_version
      : undefined
  const requiredProviders: { name: string; version: string }[] = []
  const rp = block.required_providers
  if (Array.isArray(rp)) {
    for (const entry of rp) {
      for (const [name, spec] of Object.entries(asObject(entry))) {
        const v = asObject(spec).version
        if (typeof v === 'string') requiredProviders.push({ name, version: v })
      }
    }
  }
  // Backend: hcl2json emits `backend: { <type>: [{ …attrs }] }` (one entry).
  let backend: NormalizedBackend | undefined
  const be = block.backend
  if (be && typeof be === 'object' && !Array.isArray(be)) {
    for (const [type, entries] of Object.entries(
      be as Record<string, unknown>,
    )) {
      const cfg = asObject(Array.isArray(entries) ? entries[0] : undefined)
      let encrypted: boolean | 'unresolved' | undefined = undefined
      if (cfg.encrypt === true || cfg.encrypt === false) {
        encrypted = cfg.encrypt
      } else if (cfg.encrypt !== undefined) {
        encrypted = 'unresolved'
      }
      backend = {
        type,
        encrypted,
        locked:
          typeof cfg.dynamodb_table === 'string' ||
          typeof cfg.lock_table === 'string' ||
          cfg.use_lockfile === true,
      }
      break // one backend per terraform block
    }
  }
  return [
    {
      requiredVersion,
      requiredProviders,
      backend,
      file,
      line: findTerraformLine(rawText),
    },
  ]
}
