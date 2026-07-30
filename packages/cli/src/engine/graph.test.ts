import { describe, it, expect } from 'vitest'
import { buildGraph } from './evaluate'
import { ListInfo, NormalizedResource, NormalizedValue } from '../hcl/model'

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

/** Attach list-valued attrs (e.g. `network_interface_ids = [...]`) to a resource. */
const withLists = (
  r: NormalizedResource,
  lists: Record<string, ListInfo>,
): NormalizedResource => ({ ...r, lists })

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
    ).toEqual({ reachable: true, conditional: false })
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
    ).toEqual({ reachable: true, conditional: false })
  })

  it('a resource with no ref attributes has no outgoing edges', () => {
    const standalone = res('aws_s3_bucket', 'data', {
      bucket: { kind: 'literal', value: 'data' },
    })
    const g = buildGraph([standalone])
    expect(
      g.canReach(addr('aws_s3_bucket', 'data'), 'aws_iam_role', 'both'),
    ).toEqual({ reachable: false, conditional: false })
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
    ).toEqual({ reachable: true, conditional: false })
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
    ).toEqual({ reachable: false, conditional: false })
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
    ).toEqual({ reachable: false, conditional: false })
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
    ).toEqual({ reachable: true, conditional: false })
    // Root resources CANNOT reach the submodule's IGW (different scope).
    expect(
      g.canReach(
        addr('aws_db_instance', 'db', 'main.tf'),
        'aws_internet_gateway',
        'both',
      ),
    ).toEqual({ reachable: false, conditional: false })
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
    ).toEqual({ reachable: true, conditional: false })
    expect(
      g.canReach(addr('aws_instance', 'web'), 'aws_security_group', 'forward'),
    ).toEqual({ reachable: true, conditional: false })
  })
})

describe('buildGraph — resource-type-aware edge classification (NAT subnet_id)', () => {
  it('aws_nat_gateway.subnet_id is structural, not a routing path', () => {
    // The documented false positive: a private DB egresses through a NAT.
    // The NAT is DEPLOYED in a public subnet (it needs a public IP), but
    // transit traffic does not follow the NAT's deployment subnet — it routes
    // TO the NAT via route tables. Classify by attr name + resource type so
    // NAT.subnet_id → structural (excluded from routing queries).
    const topo = (): NormalizedResource[] => [
      res('aws_db_instance', 'priv_db', {
        subnet_id: ref('${aws_subnet.priv.id}', 'aws_subnet', 'priv'),
      }),
      res('aws_subnet', 'priv'),
      res('aws_route_table_association', 'rta_priv', {
        subnet_id: ref('${aws_subnet.priv.id}', 'aws_subnet', 'priv'),
        route_table_id: ref(
          '${aws_route_table.rt_priv.id}',
          'aws_route_table',
          'rt_priv',
        ),
      }),
      res('aws_route_table', 'rt_priv', {
        nat_gateway_id: ref(
          '${aws_nat_gateway.nat.id}',
          'aws_nat_gateway',
          'nat',
        ),
      }),
      res('aws_nat_gateway', 'nat', {
        subnet_id: ref('${aws_subnet.pub.id}', 'aws_subnet', 'pub'),
      }),
      res('aws_subnet', 'pub'),
      res('aws_route_table_association', 'rta_pub', {
        subnet_id: ref('${aws_subnet.pub.id}', 'aws_subnet', 'pub'),
        route_table_id: ref(
          '${aws_route_table.rt_pub.id}',
          'aws_route_table',
          'rt_pub',
        ),
      }),
      res('aws_route_table', 'rt_pub', {
        gateway_id: ref(
          '${aws_internet_gateway.igw.id}',
          'aws_internet_gateway',
          'igw',
        ),
      }),
      res('aws_internet_gateway', 'igw'),
    ]
    const g = buildGraph(topo())
    expect(
      g.canReach(
        addr('aws_db_instance', 'priv_db'),
        'aws_internet_gateway',
        'both',
        ['routing'],
      ),
    ).toEqual({ reachable: false, conditional: false })
  })

  it('aws_db_instance.subnet_id stays routing (the governed case)', () => {
    const g = buildGraph([
      res('aws_db_instance', 'db', {
        subnet_id: ref('${aws_subnet.pub.id}', 'aws_subnet', 'pub'),
      }),
      res('aws_subnet', 'pub'),
      res('aws_route_table_association', 'rta', {
        subnet_id: ref('${aws_subnet.pub.id}', 'aws_subnet', 'pub'),
        route_table_id: ref(
          '${aws_route_table.rt.id}',
          'aws_route_table',
          'rt',
        ),
      }),
      res('aws_route_table', 'rt', {
        gateway_id: ref(
          '${aws_internet_gateway.igw.id}',
          'aws_internet_gateway',
          'igw',
        ),
      }),
      res('aws_internet_gateway', 'igw'),
    ])
    expect(
      g.canReach(
        addr('aws_db_instance', 'db'),
        'aws_internet_gateway',
        'both',
        ['routing'],
      ),
    ).toEqual({ reachable: true, conditional: false })
  })
})

describe('buildGraph — conditional edges (honest could-not-evaluate)', () => {
  const opaque = (expr: string): NormalizedValue => ({
    kind: 'unresolved',
    expr,
  })

  it('an unresolvable routing ref makes a routing query conditional (CNE)', () => {
    const g = buildGraph([
      res('aws_db_instance', 'db', {
        subnet_id: opaque('${var.subnet_id}'),
      }),
    ])
    expect(
      g.canReach(
        addr('aws_db_instance', 'db'),
        'aws_internet_gateway',
        'both',
        ['routing'],
      ),
    ).toEqual({ reachable: false, conditional: true })
  })

  it('a fully-resolved chain that misses the target is a definite pass', () => {
    const g = buildGraph([
      res('aws_db_instance', 'db', {
        subnet_id: ref('${aws_subnet.priv.id}', 'aws_subnet', 'priv'),
      }),
      res('aws_subnet', 'priv'),
      res('aws_nat_gateway', 'nat'),
    ])
    expect(
      g.canReach(
        addr('aws_db_instance', 'db'),
        'aws_internet_gateway',
        'both',
        ['routing'],
      ),
    ).toEqual({ reachable: false, conditional: false })
  })

  it('an unresolvable security ref does NOT make a routing query conditional', () => {
    const g = buildGraph([
      res('aws_db_instance', 'db', {
        vpc_security_group_ids: opaque('${var.sg}'),
      }),
    ])
    expect(
      g.canReach(
        addr('aws_db_instance', 'db'),
        'aws_internet_gateway',
        'both',
        ['routing'],
      ),
    ).toEqual({ reachable: false, conditional: false })
  })

  it('an unresolvable security ref makes a sharedWith query conditional', () => {
    const g = buildGraph([
      res('aws_db_instance', 'db', {
        vpc_security_group_ids: opaque('${var.sg}'),
      }),
    ])
    expect(
      g.sharedWith(
        addr('aws_db_instance', 'db'),
        'aws_security_group',
        'aws_lb',
      ),
    ).toEqual({ reachable: false, conditional: true })
  })

  it('an unresolvable encryption ref makes a reachableAttr query conditional', () => {
    const g = buildGraph([
      res('aws_s3_bucket', 'data', {
        kms_master_key_id: opaque('${var.key_id}'),
      }),
    ])
    expect(
      g.reachableAttr(
        addr('aws_s3_bucket', 'data'),
        'aws_kms_key',
        'key_manager',
        ['AWS'],
        'both',
      ),
    ).toEqual({ reachable: false, conditional: true })
  })
})

describe('buildGraph — list-valued reference edges', () => {
  // Real Terraform routes multi-value refs through list attrs (e.g.
  // `vpc_security_group_ids = [aws_security_group.a.id]`,
  // `network_interface_ids = [azurerm_network_interface.nic.id]`). The graph
  // must scan list items, not just scalar attributes — otherwise list-based
  // refs create no edge and the SG-shared / Azure-VM rules miss real topology.
  it('a list-valued ref creates a forward edge to each referenced resource', () => {
    const db = withLists(res('aws_db_instance', 'db'), {
      vpc_security_group_ids: {
        kind: 'resolved',
        items: [ref('${aws_security_group.sg.id}', 'aws_security_group', 'sg')],
      },
    })
    const sg = res('aws_security_group', 'sg')
    const g = buildGraph([db, sg])
    expect(
      g.canReach(
        addr('aws_db_instance', 'db'),
        'aws_security_group',
        'forward',
      ),
    ).toEqual({ reachable: true, conditional: false })
  })

  it('an opaque whole-list ref (var) degrades a security query to conditional', () => {
    // vpc_security_group_ids = var.sgs — the SG set is unknown. sharedWith
    // cannot rule out sharing → could-not-evaluate (never a false pass).
    const db = withLists(res('aws_db_instance', 'db'), {
      vpc_security_group_ids: { kind: 'unresolved' },
    })
    const g = buildGraph([db])
    expect(
      g.sharedWith(
        addr('aws_db_instance', 'db'),
        'aws_security_group',
        'aws_lb',
      ),
    ).toEqual({ reachable: false, conditional: true })
  })
})

describe('buildGraph — Azure VM → NIC → Public IP (cross-cloud graph)', () => {
  // The Azure analog of "no DB in a public subnet": a VM reaches a public IP
  // through its NIC. Two edge kinds: a list-valued NIC attachment
  // (network_interface_ids) + a nested-block public-IP ref
  // (ip_configuration.public_ip_address_id). Both must classify as routing
  // (network reachability) for denyIfReachable(['routing']) to follow them.
  const topology = (): NormalizedResource[] => [
    withLists(res('azurerm_linux_virtual_machine', 'vm'), {
      network_interface_ids: {
        kind: 'resolved',
        items: [
          ref(
            '${azurerm_network_interface.nic.id}',
            'azurerm_network_interface',
            'nic',
          ),
        ],
      },
    }),
    res('azurerm_network_interface', 'nic', {
      'ip_configuration.public_ip_address_id': ref(
        '${azurerm_public_ip.pub.id}',
        'azurerm_public_ip',
        'pub',
      ),
    }),
    res('azurerm_public_ip', 'pub'),
  ]

  it('a VM can reach a public IP through its NIC', () => {
    const g = buildGraph(topology())
    expect(
      g.canReach(
        addr('azurerm_linux_virtual_machine', 'vm'),
        'azurerm_public_ip',
        'both',
        ['routing'],
      ),
    ).toEqual({ reachable: true, conditional: false })
  })

  it('a VM whose NIC has no public IP does NOT reach a public IP', () => {
    const g = buildGraph([
      withLists(res('azurerm_linux_virtual_machine', 'vm'), {
        network_interface_ids: {
          kind: 'resolved',
          items: [
            ref(
              '${azurerm_network_interface.nic.id}',
              'azurerm_network_interface',
              'nic',
            ),
          ],
        },
      }),
      res('azurerm_network_interface', 'nic'),
    ])
    expect(
      g.canReach(
        addr('azurerm_linux_virtual_machine', 'vm'),
        'azurerm_public_ip',
        'both',
        ['routing'],
      ),
    ).toEqual({ reachable: false, conditional: false })
  })

  it('the violation path shows the VM → NIC → public-IP chain', () => {
    const g = buildGraph(topology())
    const path = g.pathTo(
      addr('azurerm_linux_virtual_machine', 'vm'),
      'azurerm_public_ip',
      'both',
      ['routing'],
    )
    expect(path).not.toBeNull()
    expect(path!.length).toBe(2)
  })
})
