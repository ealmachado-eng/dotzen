import { describe, it, expect } from 'vitest'
import { buildGraph } from './evaluate'
import { NormalizedResource, NormalizedValue } from '../hcl/model'

/** Build a NormalizedResource with the given type/name/file + attributes. */
const res = (
  type: string,
  name: string,
  attrs: Record<string, NormalizedValue> = {},
  file = 'main.tf',
): NormalizedResource => ({
  type: type as never,
  name,
  file,
  line: 1,
  ingress: [],
  tags: { kind: 'resolved', keys: [] },
  attributes: attrs,
})

/** An unresolved attribute that resolves to a resource ref (a graph edge). */
const ref = (expr: string, type: string, name: string): NormalizedValue => ({
  kind: 'unresolved',
  expr,
  resolvedRef: { type, name },
})

/** A scoped address key matching the engine's internal `assocKey`. */
const addr = (type: string, name: string, file = 'main.tf') =>
  `${file}\0${type}.${name}`

describe('buildGraph — graph construction', () => {
  it('builds a forward edge from a resolvedRef attribute', () => {
    const db = res('aws_db_instance', 'db', {
      subnet_id: ref('${aws_subnet.public.id}', 'aws_subnet', 'public'),
    })
    const subnet = res('aws_subnet', 'public')
    const g = buildGraph([db, subnet])
    // Forward: db → subnet (via subnet_id).
    expect(
      g.canReach(addr('aws_db_instance', 'db'), 'aws_subnet', 'forward'),
    ).toEqual({ reachable: true })
  })

  it('builds a reverse edge (who references this resource?)', () => {
    const db = res('aws_db_instance', 'db', {
      subnet_id: ref('${aws_subnet.public.id}', 'aws_subnet', 'public'),
    })
    const subnet = res('aws_subnet', 'public')
    const g = buildGraph([db, subnet])
    // Reverse from subnet: who points at me? → the db.
    expect(
      g.canReach(addr('aws_subnet', 'public'), 'aws_db_instance', 'reverse'),
    ).toEqual({ reachable: true })
  })

  it('a resource with no ref attributes has no outgoing edges', () => {
    const standalone = res('aws_s3_bucket', 'data', {
      bucket: { kind: 'literal', value: 'data' },
    })
    const g = buildGraph([standalone])
    expect(
      g.canReach(addr('aws_s3_bucket', 'data'), 'aws_iam_role', 'both'),
    ).toEqual({ reachable: false })
  })
})

describe('buildGraph — multi-hop traversal (the killer use case)', () => {
  // Topology: db → subnet → (reverse) route_table_association → route_table → route → IGW.
  // This is the "no DB in a public subnet" chain — 5 hops, bidirectional.
  const topology = (): NormalizedResource[] => [
    res('aws_db_instance', 'public_db', {
      subnet_id: ref('${aws_subnet.public.id}', 'aws_subnet', 'public'),
    }),
    res('aws_subnet', 'public'),
    // The association points AT the subnet (forward: assoc → subnet).
    res('aws_route_table_association', 'rta', {
      subnet_id: ref('${aws_subnet.public.id}', 'aws_subnet', 'public'),
      route_table_id: ref('${aws_route_table.rt.id}', 'aws_route_table', 'rt'),
    }),
    res('aws_route_table', 'rt'),
    // The route references the IGW (forward: rt → igw via gateway_id attr).
    // NOTE: routes are nested blocks, not top-level resources. For this test
    // we model the route's gateway_id as an attribute on the route_table
    // (simplification — the real flatten already extracts nested attrs).
    res('aws_route_table', 'rt', {
      gateway_id: ref(
        '${aws_internet_gateway.igw.id}',
        'aws_internet_gateway',
        'igw',
      ),
    }),
    res('aws_internet_gateway', 'igw'),
  ]

  it('a DB in a public subnet can reach an Internet Gateway (bidirectional)', () => {
    const g = buildGraph(topology())
    // db → forward → subnet → reverse → rta → forward → rt → forward → igw.
    expect(
      g.canReach(
        addr('aws_db_instance', 'public_db'),
        'aws_internet_gateway',
        'both',
      ),
    ).toEqual({ reachable: true })
  })

  it('forward-only traversal does NOT reach the IGW (needs reverse hops)', () => {
    const g = buildGraph(topology())
    // db → forward → subnet. Can't reverse to find the association.
    expect(
      g.canReach(
        addr('aws_db_instance', 'public_db'),
        'aws_internet_gateway',
        'forward',
      ),
    ).toEqual({ reachable: false })
  })

  it('a private DB (no route to an IGW) does NOT reach the Internet Gateway', () => {
    const privateTopology: NormalizedResource[] = [
      res('aws_db_instance', 'private_db', {
        subnet_id: ref('${aws_subnet.private.id}', 'aws_subnet', 'private'),
      }),
      res('aws_subnet', 'private'),
      res('aws_route_table_association', 'rta_private', {
        subnet_id: ref('${aws_subnet.private.id}', 'aws_subnet', 'private'),
        route_table_id: ref(
          '${aws_route_table.rt_private.id}',
          'aws_route_table',
          'rt_private',
        ),
      }),
      // Private route table routes to a NAT gateway, NOT an IGW.
      res('aws_route_table', 'rt_private', {
        nat_gateway_id: ref(
          '${aws_nat_gateway.nat.id}',
          'aws_nat_gateway',
          'nat',
        ),
      }),
      res('aws_nat_gateway', 'nat'),
    ]
    const g = buildGraph(privateTopology)
    expect(
      g.canReach(
        addr('aws_db_instance', 'private_db'),
        'aws_internet_gateway',
        'both',
      ),
    ).toEqual({ reachable: false })
  })
})

describe('buildGraph — module-scope isolation', () => {
  it('edges do NOT cross module boundaries (file-trace scoping)', () => {
    // A root DB referencing a root subnet (same module = same file).
    const rootDb = res(
      'aws_db_instance',
      'db',
      { subnet_id: ref('${aws_subnet.sub.id}', 'aws_subnet', 'sub') },
      'main.tf',
    )
    const rootSubnet = res('aws_subnet', 'sub', {}, 'main.tf')
    // A submodule IGW (different file-trace → different scope).
    const modIgw = res(
      'aws_internet_gateway',
      'igw',
      {},
      'modules/x/main.tf (x)',
    )

    const g = buildGraph([rootDb, rootSubnet, modIgw])
    // Root resources can reach root resources (same scope).
    expect(
      g.canReach(
        addr('aws_db_instance', 'db', 'main.tf'),
        'aws_subnet',
        'both',
      ),
    ).toEqual({ reachable: true })
    // Root resources CANNOT reach the submodule's IGW (different scope).
    expect(
      g.canReach(
        addr('aws_db_instance', 'db', 'main.tf'),
        'aws_internet_gateway',
        'both',
      ),
    ).toEqual({ reachable: false })
  })
})

describe('buildGraph — multiple edges from one resource', () => {
  it('a resource with multiple ref attrs creates multiple edges', () => {
    const ec2 = res('aws_instance', 'web', {
      subnet_id: ref('${aws_subnet.main.id}', 'aws_subnet', 'main'),
      vpc_security_group_ids: ref(
        '${aws_security_group.sg.id}',
        'aws_security_group',
        'sg',
      ),
    })
    const subnet = res('aws_subnet', 'main')
    const sg = res('aws_security_group', 'sg')
    const g = buildGraph([ec2, subnet, sg])
    // EC2 can reach both the subnet and the SG.
    expect(
      g.canReach(addr('aws_instance', 'web'), 'aws_subnet', 'forward'),
    ).toEqual({ reachable: true })
    expect(
      g.canReach(addr('aws_instance', 'web'), 'aws_security_group', 'forward'),
    ).toEqual({ reachable: true })
  })
})
