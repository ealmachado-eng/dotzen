import {
  AwsResource,
  AzureResource,
  GcpResource,
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
} from './model'

/** hcl2json emits `{ resource: { type: { name: [block, ...] } } }`. */
export interface Hcl2JsonRoot {
  resource?: Record<string, Record<string, unknown[]>>
  variable?: Record<string, unknown[]>
  locals?: unknown[]
  /** `module "x" { source = …, <inputs> }` → `{ x: [{ source, … }] }`. */
  module?: Record<string, unknown[]>
}

/** Resolved `var.*` / `local.*` values, keyed by reference, raw form. */
export type Scope = Map<string, unknown>

const KNOWN_TYPES = new Set<string>([
  ...Object.values(AwsResource),
  ...Object.values(AzureResource),
  ...Object.values(GcpResource),
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

// A value that is *exactly* one `var.x` / `local.y` reference — the only
// form we resolve. Compound interpolations (`"a-${var.x}"`) stay unresolved.
const SOLE_REF = /^\$\{(var|local)\.([A-Za-z0-9_-]+)\}$/

/**
 * Resolve a raw value against the scope. A sole `var`/`local` reference is
 * followed (through local→var chains, depth-bounded) to its literal; a
 * reference with no known value, or any non-sole-reference expression,
 * stays unresolved — which correctly yields "could not evaluate".
 */
function resolveValue(raw: unknown, scope: Scope, depth = 8): NormalizedValue {
  if (typeof raw === 'string') {
    const m = SOLE_REF.exec(raw)
    if (m) {
      const key = `${m[1]}.${m[2]}`
      if (depth > 0 && scope.has(key))
        return resolveValue(scope.get(key), scope, depth - 1)
      return { kind: 'unresolved', expr: raw }
    }
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

/** Follow a sole var/local reference to its raw resolved value (or undefined). */
export function resolveRaw(
  raw: unknown,
  scope: Scope,
  depth = 8,
): unknown | undefined {
  if (typeof raw === 'string') {
    const m = SOLE_REF.exec(raw)
    if (m) {
      const key = `${m[1]}.${m[2]}`
      if (depth > 0 && scope.has(key))
        return resolveRaw(scope.get(key), scope, depth - 1)
      return undefined
    }
    if (isInterpolated(raw)) return undefined // compound expr / function call
  }
  return raw
}

/** Substitute `<iterator>.value[.field]` references with the element value. */
function substituteValue(v: unknown, iterator: string, el: unknown): unknown {
  if (typeof v === 'string') {
    const it = escapeRegExp(iterator)
    // eslint-disable-next-line security/detect-non-literal-regexp -- iterator escaped
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
 * (known-present keys, may be more); anything else is unresolved.
 */
function tagsOf(
  type: string,
  block: Record<string, unknown> | undefined,
  scope: Scope,
): TagsInfo {
  const r = tagKeys(block?.[tagField(type)], scope)
  if (r === null) return { kind: 'unresolved' }
  return r.complete
    ? { kind: 'resolved', keys: r.keys }
    : { kind: 'partial', keys: r.keys }
}

/** Resolved value of the `environment` tag (for rule scoping), if present. */
function environmentOf(
  type: string,
  block: Record<string, unknown> | undefined,
  scope: Scope,
): NormalizedValue | undefined {
  const t = block?.[tagField(type)]
  if (!t || typeof t !== 'object' || Array.isArray(t)) return undefined
  const env = (t as Record<string, unknown>).environment
  return env === undefined ? undefined : resolveValue(env, scope)
}

// Blocks handled elsewhere (ingress/egress) or as tags — not attributes.
const NON_ATTR_BLOCKS = new Set(['ingress', 'egress', 'dynamic', 'tags'])

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
 * Extract scalar attributes and list-valued attributes from a block,
 * recursing through nested blocks and flattening to dotted keys
 * (`vpc_config { public_access_cidrs = [...] }` -> list
 * `vpc_config.public_access_cidrs`; `metadata_options { http_tokens = x }`
 * -> attribute `metadata_options.http_tokens`). Maps (tags) are skipped;
 * ingress/egress/dynamic are handled elsewhere.
 */
function collect(
  prefix: string,
  obj: Record<string, unknown>,
  scope: Scope,
  out: Extracted,
): void {
  for (const [k, v] of Object.entries(obj)) {
    if (v === null) continue
    if (prefix === '' && NON_ATTR_BLOCKS.has(k)) continue
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

const escapeRegExp = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Best-effort line of a `resource "type" "name"` block via text scan. */
function findLine(text: string, type: string, name: string): number {
  const lines = text.split(/\r?\n/)
  // eslint-disable-next-line security/detect-non-literal-regexp -- inputs escaped above
  const needle = new RegExp(
    `resource\\s+"${escapeRegExp(type)}"\\s+"${escapeRegExp(name)}"`,
  )
  for (let i = 0; i < lines.length; i++) {
    if (needle.test(lines[i] ?? '')) return i + 1
  }
  return 1
}

/**
 * Adapter boundary (doc 06): parser output -> dotzen's own model.
 * The engine never sees `Hcl2JsonRoot`. `scope` resolves var/local refs.
 */
export function normalize(
  parsed: Hcl2JsonRoot,
  file: string,
  rawText: string,
  scope: Scope = new Map(),
  environmentOverride?: string,
): NormalizedResource[] {
  const out: NormalizedResource[] = []
  const byType = parsed.resource ?? {}

  for (const [type, byName] of Object.entries(byType)) {
    if (!KNOWN_TYPES.has(type)) continue
    for (const [name, blocks] of Object.entries(byName)) {
      const block = (Array.isArray(blocks) ? blocks[0] : blocks) as
        Record<string, unknown> | undefined
      const extracted = extractAttrs(block, scope)
      out.push({
        type: type as AnyResource,
        name,
        file,
        line: findLine(rawText, type, name),
        ingress: ingressFor(type, block, scope),
        egress: egressFor(block, scope),
        tags: tagsOf(type, block, scope),
        attributes: extracted.attributes,
        lists: extracted.lists,
        blocks: extracted.blocks,
        policy: policyOf(block),
        containers: containersOf(block),
        envVars: envVarsOf(type, block, scope),
        // A root's declared environment wins over the resource's own tag.
        environment:
          environmentOverride !== undefined
            ? { kind: 'literal', value: environmentOverride }
            : environmentOf(type, block, scope),
      })
    }
  }
  return out
}
