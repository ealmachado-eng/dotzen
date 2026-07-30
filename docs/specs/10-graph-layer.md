# 10 — Graph Layer (dependency-graph rules)

Status: **Proposed.** This document defines a new capability for the dotzen
engine: a **multi-hop dependency graph** over normalized resources, enabling
rule conditions that traverse chains of references (e.g. "no database in a
public subnet" requires walking `db → subnet → route_table → route → igw`).
It is the natural next capability after the per-resource + single-hop
association model in `06-engine-architecture.md`, and the one class of
controls no static Terraform tool currently does well.

Read `06-engine-architecture.md` first — this doc extends its model.

## The problem: per-resource + single-hop is not enough

dotzen today evaluates each resource in isolation, with ONE cross-resource
primitive: `mustHaveAssociated` / `denyIfAssociated` (single-hop: "does a
child resource reference me via attribute X?"). This covers most CIS controls
— encryption, tags, ports, IAM, block presence. But a class of real-world
security controls requires **multi-hop traversal** through a chain of resource
references:

- **"No database in a public subnet"** — `aws_db_instance.subnet_id` →
  `aws_subnet` → `aws_route_table_association` (reverse: who references this
  subnet?) → `aws_route_table` → `aws_route.gateway_id` →
  `aws_internet_gateway`. Five hops, alternating forward + reverse.
- **"No shared SG between a public LB and a private DB"** — an
  `aws_security_group` referenced by both an `aws_lb` (public) and an
  `aws_db_instance` (private) → lateral-movement risk. Requires bidirectional
  traversal from the SG.
- **"KMS key used by a bucket must be customer-managed"** —
  `aws_s3_bucket.kms_key_id` → `aws_kms_key` → check `key_manager` attribute.

AI-generated Terraform is notorious for these patterns — the LLM doesn't
understand network topology or transitive security implications. This is
exactly where a graph-aware governance tool adds unique value over Checkov /
TFSec (which are per-resource, not graph-traversing).

## Design principle: the graph is a post-normalize index

The graph does NOT replace the normalizer or the association index. It is a
**new index** built from the existing `NormalizedResource[]`, alongside the
existing `buildAssociations`:

```
normalize() → NormalizedResource[]
                ↓
    buildAssociations()  →  Associations (single-hop, existing)
    buildGraph()         →  ResourceGraph (multi-hop, NEW)
                ↓
    EvalContext { associations, graph, ... }
                ↓
    evaluate() — existing conditions use associations;
                 new conditions use graph
```

The existing conditions (`mustHaveAssociated`, `denyIfAssociated`) keep using
the association index (simpler, proven, sufficient for single-hop). Only the
new graph-aware conditions use the graph. This is additive — no existing rule
or condition changes behavior.

## The graph model

### Nodes

Each node is a normalized resource, identified by its scoped address
(`${file}|${type}.${name}`). The file-trace scope (from `followModules`)
isolates module instances — the same isolation principle as the v1.9.21
association-index fix (`assocKey`). A graph edge from a root resource cannot
traverse into a submodule's resources (and vice-versa) unless connected
through a module-output edge (reserved for a future iteration).

### Edges

An edge represents a resource-reference relationship extracted from an
attribute. Every attribute whose `resolvedRef` (or fallback `RESOURCE_REF`
regex match) points at a concrete resource generates an edge:

```typescript
interface GraphEdge {
  /** The resource that carries the reference (the source). */
  readonly from: string   // scoped address: `${file}|${type}.${name}`
  /** The resource being referenced (the target). */
  readonly to: string     // scoped address
  /** The attribute on `from` that carries the reference. */
  readonly via: string    // e.g. 'subnet_id', 'security_group_ids', 'gateway_id'
  /** Whether the reference chain was fully resolved. If false, traversal
   *  through this edge yields could-not-evaluate (not a definite verdict). */
  readonly conditional: boolean
}
```

**No edge types in v1.** The initial graph treats every reference as an
untyped edge (any `resolvedRef` → edge). This is the simplest model that
covers the killer use cases. Edge types (`references` vs `attached` vs
`routes`) are a future refinement for rules that need to distinguish the
*semantic* nature of the connection (e.g. "follow routing edges only"). For
now, `denyIfReachable` follows ALL edges — the `targetType` parameter scopes
the query precisely enough.

### Bidirectional adjacency

The graph supports traversal in BOTH directions:

- **Forward edges:** resource A's attribute points at resource B → edge `A → B`.
  Example: `db.subnet_id → aws_subnet.private`.
- **Reverse edges:** who points AT resource A? → edges `? → A`.
  Example: `aws_route_table_association` whose `subnet_id` matches
  `aws_subnet.private` → edge `association → subnet`.

Both are built from the same edge set; the reverse index is just the edges
keyed by `to` instead of `from`.

```typescript
interface ResourceGraph {
  /** Edges FROM each address (forward adjacency). */
  readonly forward: Map<string, GraphEdge[]>
  /** Edges TO each address (reverse adjacency). */
  readonly reverse: Map<string, GraphEdge[]>

  /** BFS: all addresses reachable from `start`, following edges in the
   *  given direction(s). Returns the set of reachable addresses + whether
   *  any path was conditional (unresolvable). */
  reachable(start: string, direction: 'forward' | 'reverse' | 'both'): ReachResult

  /** Does any resource of `targetType` appear in the reachable set? */
  canReach(start: string, targetType: string, direction: 'forward' | 'reverse' | 'both'): ReachResult

  /** The shortest path from `start` to any resource of `targetType`
   *  (for violation detail — "here is the chain that makes this public"). */
  pathTo(start: string, targetType: string, direction: 'forward' | 'reverse' | 'both'): GraphEdge[] | null
}

interface ReachResult {
  readonly reachable: boolean
  readonly conditional: boolean  // true if any edge in the path was unresolvable
}
```

The `direction` parameter is key for the DB-in-public-subnet case:
- Start at `aws_db_instance` → forward to `aws_subnet` (via `subnet_id`).
- From `aws_subnet` → **reverse** to find `aws_route_table_association` (who references this subnet?).
- From the association → forward to `aws_route_table` (via `route_table_id`).
- From route_table → forward through nested route blocks → `aws_route.gateway_id` → `aws_internet_gateway`.

So the traversal uses `direction: 'both'` — it walks forward AND reverse to
thread the chain.

## Edge construction (`buildGraph`)

```typescript
function buildGraph(resources: NormalizedResource[]): ResourceGraph {
  const forward = new Map<string, GraphEdge[]>()
  const reverse = new Map<string, GraphEdge[]>()

  for (const res of resources) {
    const fromAddr = assocKey(res.file, `${res.type}.${res.name}`)
    for (const [attr, value] of Object.entries(res.attributes)) {
      if (value.kind === 'unresolved' && value.resolvedRef) {
        const toAddr = assocKey(res.file, `${value.resolvedRef.type}.${value.resolvedRef.name}`)
        const edge: GraphEdge = { from: fromAddr, to: toAddr, via: attr, conditional: false }
        addEdge(forward, fromAddr, edge)
        addEdge(reverse, toAddr, edge)
      }
      // Also check the RESOURCE_REF fallback (same regex as buildAssociations).
      // And the unresolvable-var case → conditional edge.
    }
  }
  return { forward, reverse, reachable, canReach, pathTo }
}
```

This reuses the SAME `resolvedRef` + `RESOURCE_REF` + `assocKey` machinery
from `buildAssociations` — no new resolution logic. The graph is the
generalized form (all edges, not just the one `via` per condition).

## New condition types

### `denyIfReachable`

The core graph-aware condition. Fires if the resource can reach a target
type through any chain of references.

```typescript
| {
    readonly kind: 'denyIfReachable'
    readonly targetType: AnyResource
    readonly direction?: 'forward' | 'reverse' | 'both'  // default: 'both'
  }
```

Evaluation:
```typescript
function evalDenyIfReachable(c, r, ctx): ConditionOutcome {
  const start = assocKey(r.file, `${r.type}.${r.name}`)
  const result = ctx.graph.canReach(start, c.targetType, c.direction ?? 'both')
  if (result.reachable && !result.conditional)
    return { kind: 'violation', detail: `reachable to ${c.targetType}` }
  if (result.reachable && result.conditional)
    return { kind: 'cannotEvaluate', reason: `path to ${c.targetType} is partially unresolvable` }
  return { kind: 'pass' }
}
```

### `denyIfSharedWith`

Bidirectional: fires if this resource shares a referenced resource (e.g. a
security group) with a resource of a different trust level.

```typescript
| {
    readonly kind: 'denyIfSharedWith'
    readonly sharedType: AnyResource     // e.g. aws_security_group
    readonly otherType: AnyResource      // e.g. aws_lb (the "public" side)
  }
```

Evaluation: find all resources of `sharedType` that reference this resource
(reverse). For each, check if any resource of `otherType` also references it
(reverse from the shared resource). If yes → the SG is shared between this
resource and the other type → violation.

## Degradation rules (the discipline stays)

| Situation | Edge state | Query result | Evaluator outcome |
|---|---|---|---|
| Chain fully resolved (all refs concrete) | All edges definite | `reachable: true, conditional: false` | **violation** |
| Chain partially unresolvable (a var/local didn't bottom out) | Some edges `conditional: true` | `reachable: true, conditional: true` | **could-not-evaluate** |
| No path exists | No edges to traverse | `reachable: false` | **pass** (definite absence) |
| Start resource has no edges at all | Empty adjacency | `reachable: false` | **pass** |

This preserves dotzen's core discipline: **never a guess, never a false
verdict.** A partially-resolved chain degrades to CNE, not a violation and
not a pass.

## The worked examples

### Example 1: No DB in a public subnet

```ts
rule()
  .id('no-db-in-public-subnet')
  .resource(AwsResource.DbInstance)
  .denyIfReachable(AwsResource.InternetGateway)
  .message('Database instances must not be in a public subnet')
  .rationale('CIS AWS — isolate data stores from direct internet access')
```

The graph traversal (direction: 'both'):
1. `aws_db_instance.this` → forward via `subnet_id` → `aws_subnet.private`
2. `aws_subnet.private` → **reverse** → `aws_route_table_association` (whose `subnet_id` matches)
3. association → forward via `route_table_id` → `aws_route_table.main`
4. route_table → forward through nested `route` block → `gateway_id` → `aws_internet_gateway.igw`
5. Target type `aws_internet_gateway` reached → **violation**.

If any edge in the chain is unresolvable (e.g. `subnet_id = var.x` with no
default) → **could-not-evaluate**.

### Example 2: No shared SG between public LB and private DB

```ts
rule()
  .id('no-sg-shared-lb-db')
  .resource(AwsResource.DbInstance)
  .denyIfSharedWith(AwsResource.SecurityGroup, AwsResource.Lb)
  .message('DB security groups must not be shared with public load balancers')
  .rationale('Lateral-movement prevention — isolate trust boundaries')
```

The graph traversal:
1. `aws_db_instance.this` → reverse → find `aws_security_group` referenced by this DB (via `vpc_security_group_ids`).
2. For each SG → reverse → is it also referenced by an `aws_lb`?
3. If yes → the SG bridges a public LB and a private DB → **violation**.

### Example 3: KMS key must be customer-managed

This is a graph traversal + attribute check (the condition traverses to the
KMS key, then checks its `key_manager` attribute). This requires a new
condition type that combines traversal with an attribute check:

```ts
| {
    readonly kind: 'denyIfReachableAttr'
    readonly targetType: AnyResource
    readonly attr: AnyAttribute
    readonly values: (string | number)[]
  }
```

Traversal to `targetType` → check its `attr` → if in `values` → violation.

```ts
rule()
  .id('no-aws-managed-kms')
  .resource(AwsResource.S3Bucket)
  .denyIfReachableAttr(AwsResource.KmsKey, AwsAttribute.KeyManager, 'AWS')
  .message('Buckets must use customer-managed KMS keys, not AWS-managed defaults')
```

## Performance

- **Graph construction:** O(R × A) where R = resources, A = avg attributes per resource. For 1200 resources × ~10 attrs = ~12k iterations. Sub-10ms (same class as `buildAssociations`).
- **Query (BFS/DFS):** O(V + E) per query. With <500 resources and <2000 edges (typical repo), each query is sub-millisecond.
- **Optimization (pre-computed public-subnet set):** for the common
  `denyIfReachable(InternetGateway)` rule, pre-compute the set of "public
  subnets" (subnets with a route to an IGW) ONCE, then each resource's check
  is a constant-time lookup (is my subnet in the public set?). This avoids
  per-resource BFS for the hottest query. The pre-computation is a future
  optimization; v1 does raw BFS (sufficient for typical repo sizes).

## Module boundaries

Edges are scoped by `assocKey(file, address)` — the same file-trace scope
as the v1.9.21 association-index fix. A forward edge from a root resource
can only reach resources in the same module instance. Cross-module
references (via `module.x.y` outputs) are a future edge type
(`module-output`) — not in v1.

This prevents the cross-module aliasing false-positive that v1.9.21 fixed
for associations: a submodule's `aws_iam_role_policy` referencing
`aws_iam_role.this` only links to the role in its OWN module.

## Relationship to existing architecture

| Existing | Graph layer relationship |
|---|---|
| `buildAssociations` (single-hop) | The graph generalizes it (multi-hop). Both coexist; existing conditions use associations, new conditions use graph. |
| `resolvedRef` / `RESOURCE_REF` | Reused unchanged — the graph's edges come from the same resolution mechanism. |
| `assocKey` (file-trace scoping) | Reused unchanged — module isolation for graph edges. |
| `conditionalBlocks` / `unresolvableCandidates` | Same degradation principle (conditional → CNE) extended to graph edges. |
| `EvalContext` | Gets a new `graph` field alongside `associations` / `literalLinks` / `unresolvableCandidates`. |

## Implementation phases

1. **`buildGraph` + `ResourceGraph`** — the data structure + BFS/DFS queries.
   No conditions yet; unit-test the graph construction against hand-built
   `NormalizedResource[]` with known topology.
2. **`denyIfReachable`** — the first condition evaluator. Integration-test
   against `.tf` fixtures with known public/private subnet topology (a
   violating fixture + a passing fixture).
3. **`denyIfSharedWith`** — the SG-shared condition.
4. **`denyIfReachableAttr`** — traversal + attribute check (KMS key manager).
5. **Pre-computed public-subnet set** — the perf optimization for the hottest query.
6. **Edge types** (future) — `references` / `attached` / `routes` for rules
   that need to distinguish the semantic nature of connections.

## What this doc does NOT decide

- **Edge types.** v1 is untyped (all refs → edges). Types are a future
  refinement for rules that need to follow only routing edges, for example.
- **Module-output edges.** Cross-module graph traversal (a root resource
  reaching into a followed module's resources via `module.x.y` outputs) is
  reserved for a future iteration. v1 is intra-module only.
- **The exact `.tf` fixture set.** The implementation TDD phase will
  design fixtures with known topology (violating: DB in public subnet;
  passing: DB in private subnet with NAT gateway; conditional: subnet_id
  via unresolved var).
- **Cross-cloud graph rules.** The initial conditions target AWS (the
  subnet/route/IGW topology is AWS-specific). Azure/GCP equivalents
  (NSG/subnet, GCP firewall/network) follow the same graph model but need
  cloud-specific edge extraction.

## See also

- `06-engine-architecture.md` — the pipeline, ROP rules, the association
  model this extends.
- `02-spec-dsl.md` — the Condition discriminated union (this doc adds new
  members).
- `docs/ROADMAP.md` → "Future directions" → "v2 graph layer" — the
  roadmap entry this design satisfies.
