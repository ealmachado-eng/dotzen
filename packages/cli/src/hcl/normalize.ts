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
  TagsInfo,
  PolicyInfo,
  ListInfo,
  ContainerInfo,
} from './model'

/** hcl2json emits `{ resource: { type: { name: [block, ...] } } }`. */
export interface Hcl2JsonRoot {
  resource?: Record<string, Record<string, unknown[]>>
  variable?: Record<string, unknown[]>
  locals?: unknown[]
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

function toValue(raw: unknown): NormalizedValue {
  if (typeof raw === 'string' && isInterpolated(raw))
    return { kind: 'unresolved', expr: raw }
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
  const cidrs = Array.isArray(oo.cidr_blocks) ? oo.cidr_blocks : []
  return {
    fromPort: resolveValue(oo.from_port, scope),
    toPort: resolveValue(oo.to_port, scope),
    cidrBlocks: cidrs.map((c) => resolveValue(c, scope)),
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
function resolveRaw(
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

/**
 * Tags: a literal map gives us the present keys; a `${...}` expression
 * (var/merge/local) is unresolved; an absent block is resolved-but-empty
 * (the literal AI-generated case — no tags written means none present).
 */
function tagsOf(block: Record<string, unknown> | undefined): TagsInfo {
  const t = block?.tags
  if (t === undefined) return { kind: 'resolved', keys: [] }
  if (typeof t === 'string' && isInterpolated(t)) return { kind: 'unresolved' }
  if (t && typeof t === 'object' && !Array.isArray(t))
    return { kind: 'resolved', keys: Object.keys(t) }
  return { kind: 'unresolved' }
}

/** Resolved value of the `environment` tag (for rule scoping), if present. */
function environmentOf(
  block: Record<string, unknown> | undefined,
  scope: Scope,
): NormalizedValue | undefined {
  const t = block?.tags
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
 * Parse an IAM `policy` argument. A literal JSON document (heredoc/inline
 * string) is parsed into statements; a `jsonencode(...)` expression, a
 * variable, or malformed JSON is `unresolved` (=> "could not evaluate").
 */
function policyOf(
  block: Record<string, unknown> | undefined,
): PolicyInfo | undefined {
  const raw = block?.policy
  if (typeof raw !== 'string') return undefined // no inline JSON policy
  if (isInterpolated(raw)) return { kind: 'unresolved' } // jsonencode/var/...
  let doc: unknown
  try {
    doc = JSON.parse(raw)
  } catch {
    return { kind: 'unresolved' }
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
    }
  })
  return { kind: 'parsed', statements }
}

/** Parse ECS `container_definitions` (a literal-JSON array of containers). */
function containersOf(
  block: Record<string, unknown> | undefined,
): ContainerInfo | undefined {
  const raw = block?.container_definitions
  if (typeof raw !== 'string') return undefined
  if (isInterpolated(raw)) return { kind: 'unresolved' } // jsonencode/var
  let doc: unknown
  try {
    doc = JSON.parse(raw)
  } catch {
    return { kind: 'unresolved' }
  }
  const arr = Array.isArray(doc) ? doc : []
  const containers = arr.map((c) => {
    const co = asObject(c)
    return {
      name: typeof co.name === 'string' ? co.name : '',
      privileged: co.privileged === true,
    }
  })
  return { kind: 'parsed', containers }
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
        tags: tagsOf(block),
        attributes: extracted.attributes,
        lists: extracted.lists,
        blocks: extracted.blocks,
        policy: policyOf(block),
        containers: containersOf(block),
        // A root's declared environment wins over the resource's own tag.
        environment:
          environmentOverride !== undefined
            ? { kind: 'literal', value: environmentOverride }
            : environmentOf(block, scope),
      })
    }
  }
  return out
}
