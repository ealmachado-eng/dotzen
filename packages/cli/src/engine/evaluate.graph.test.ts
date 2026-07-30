import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { Rule } from '../spec/rule'
import { ListInfo, NormalizedResource, NormalizedValue } from '../hcl/model'
import { Effect } from '../vocabulary'

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

const ref = (expr: string, type: string, name: string): NormalizedValue => ({
  kind: 'unresolved',
  expr,
  resolvedRef: { type, name },
})

const noIgwRule: Rule = {
  id: 'no-igw-reachable',
  target: { kind: 'resource', types: ['aws_db_instance'] as never },
  conditions: [
    {
      kind: 'denyIfReachable',
      targetType: 'aws_internet_gateway' as never,
    },
  ],
  effect: Effect.Block,
  message: 'DB must not be reachable to an Internet Gateway',
}

describe('evaluate — denyIfReachable (graph condition)', () => {
  it('violates when a DB can reach an IGW through a public-subnet chain', () => {
    // db → subnet → (reverse) route_table_assoc → route_table → route → igw.
    const resources: NormalizedResource[] = [
      res('aws_db_instance', 'db', {
        subnet_id: ref('${aws_subnet.public.id}', 'aws_subnet', 'public'),
      }),
      res('aws_subnet', 'public'),
      res('aws_route_table_association', 'rta', {
        subnet_id: ref('${aws_subnet.public.id}', 'aws_subnet', 'public'),
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
    ]
    const r = evaluate([noIgwRule], resources)
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.resource).toBe('aws_db_instance.db')
    expect(r.violations[0]?.message).toMatch(/Internet Gateway/)
    // The violation detail includes the reference chain (path detail).
    expect(r.violations[0]?.detail).toMatch(/aws_subnet\.public/)
    expect(r.violations[0]?.detail).toMatch(/aws_internet_gateway\.igw/)
  })

  it('passes when a DB is in a private subnet (routes via NAT, not IGW)', () => {
    const resources: NormalizedResource[] = [
      res('aws_db_instance', 'private_db', {
        subnet_id: ref('${aws_subnet.private.id}', 'aws_subnet', 'private'),
      }),
      res('aws_subnet', 'private'),
      res('aws_route_table_association', 'rta_p', {
        subnet_id: ref('${aws_subnet.private.id}', 'aws_subnet', 'private'),
        route_table_id: ref(
          '${aws_route_table.rt_p.id}',
          'aws_route_table',
          'rt_p',
        ),
      }),
      res('aws_route_table', 'rt_p', {
        nat_gateway_id: ref(
          '${aws_nat_gateway.nat.id}',
          'aws_nat_gateway',
          'nat',
        ),
      }),
      res('aws_nat_gateway', 'nat'),
    ]
    const r = evaluate([noIgwRule], resources)
    expect(r.violations).toHaveLength(0)
  })

  it('passes when the DB has no edges (no subnet_id ref)', () => {
    const resources: NormalizedResource[] = [
      res('aws_db_instance', 'standalone'),
    ]
    const r = evaluate([noIgwRule], resources)
    expect(r.violations).toHaveLength(0)
  })

  it('does not affect non-targeted resource types', () => {
    // The rule targets aws_db_instance; an EC2 in a public subnet is not checked.
    const resources: NormalizedResource[] = [
      res('aws_instance', 'web', {
        subnet_id: ref('${aws_subnet.public.id}', 'aws_subnet', 'public'),
      }),
      res('aws_subnet', 'public'),
      res('aws_route_table', 'rt', {
        gateway_id: ref(
          '${aws_internet_gateway.igw.id}',
          'aws_internet_gateway',
          'igw',
        ),
      }),
      res('aws_internet_gateway', 'igw'),
    ]
    const r = evaluate([noIgwRule], resources)
    expect(r.violations).toHaveLength(0)
  })

  it('violates on multiple DBs if both reach the IGW', () => {
    const resources: NormalizedResource[] = [
      res('aws_db_instance', 'db1', {
        subnet_id: ref('${aws_subnet.public.id}', 'aws_subnet', 'public'),
      }),
      res('aws_db_instance', 'db2', {
        subnet_id: ref('${aws_subnet.public.id}', 'aws_subnet', 'public'),
      }),
      res('aws_subnet', 'public'),
      res('aws_route_table_association', 'rta', {
        subnet_id: ref('${aws_subnet.public.id}', 'aws_subnet', 'public'),
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
    ]
    const r = evaluate([noIgwRule], resources)
    expect(r.violations).toHaveLength(2)
  })

  it('does NOT violate when a private DB egresses via a NAT in a public subnet', () => {
    // The classic NAT false positive: transit traffic routes TO the NAT (via
    // route tables), it does NOT follow the NAT's deployment subnet. The
    // NAT is deployed in a public subnet (needs a public IP) — that subnet_id
    // is structural, not a routing path to the IGW.
    const resources: NormalizedResource[] = [
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
    const r = evaluate([noIgwRule], resources)
    expect(r.violations).toHaveLength(0)
    expect(r.couldNotEvaluate).toHaveLength(0)
  })

  it('degrades to couldNotEvaluate when the subnet chain is unresolvable', () => {
    // subnet_id = var.subnet_id (no default, no module input) — the chain
    // points somewhere we can't see. Honest CNE, not a false pass.
    const resources: NormalizedResource[] = [
      res('aws_db_instance', 'db', {
        subnet_id: { kind: 'unresolved', expr: '${var.subnet_id}' },
      }),
    ]
    const r = evaluate([noIgwRule], resources)
    expect(r.violations).toHaveLength(0)
    expect(r.couldNotEvaluate).toHaveLength(1)
  })
})

describe('evaluate — denyIfSharedWith (SG bridging)', () => {
  const noSharedSgRule: Rule = {
    id: 'no-sg-shared-lb-db',
    target: { kind: 'resource', types: ['aws_db_instance'] as never },
    conditions: [
      {
        kind: 'denyIfSharedWith',
        sharedType: 'aws_security_group' as never,
        otherType: 'aws_lb' as never,
      },
    ],
    effect: Effect.Block,
    message: 'DB security groups must not be shared with load balancers',
  }

  it('violates when a DB and an LB share the same security group', () => {
    const resources: NormalizedResource[] = [
      res('aws_db_instance', 'db', {
        vpc_security_group_ids: ref(
          '${aws_security_group.shared.id}',
          'aws_security_group',
          'shared',
        ),
      }),
      res('aws_lb', 'public_lb', {
        security_groups: ref(
          '${aws_security_group.shared.id}',
          'aws_security_group',
          'shared',
        ),
      }),
      res('aws_security_group', 'shared'),
    ]
    const r = evaluate([noSharedSgRule], resources)
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.resource).toBe('aws_db_instance.db')
    // The violation detail includes the SG-bridge chain (path detail).
    expect(r.violations[0]?.detail).toMatch(/aws_security_group\.shared/)
    expect(r.violations[0]?.detail).toMatch(/aws_lb\.public_lb/)
  })

  it('passes when the DB has its own SG not shared with any LB', () => {
    const resources: NormalizedResource[] = [
      res('aws_db_instance', 'db', {
        vpc_security_group_ids: ref(
          '${aws_security_group.db_sg.id}',
          'aws_security_group',
          'db_sg',
        ),
      }),
      res('aws_lb', 'public_lb', {
        security_groups: ref(
          '${aws_security_group.lb_sg.id}',
          'aws_security_group',
          'lb_sg',
        ),
      }),
      res('aws_security_group', 'db_sg'),
      res('aws_security_group', 'lb_sg'),
    ]
    const r = evaluate([noSharedSgRule], resources)
    expect(r.violations).toHaveLength(0)
  })

  it('passes when the DB has no security group at all', () => {
    const resources: NormalizedResource[] = [
      res('aws_db_instance', 'standalone'),
      res('aws_lb', 'lb', {
        security_groups: ref(
          '${aws_security_group.sg.id}',
          'aws_security_group',
          'sg',
        ),
      }),
      res('aws_security_group', 'sg'),
    ]
    const r = evaluate([noSharedSgRule], resources)
    expect(r.violations).toHaveLength(0)
  })

  it('degrades to couldNotEvaluate when the DB SG ref is unresolvable', () => {
    const resources: NormalizedResource[] = [
      res('aws_db_instance', 'db', {
        vpc_security_group_ids: { kind: 'unresolved', expr: '${var.sg}' },
      }),
    ]
    const r = evaluate([noSharedSgRule], resources)
    expect(r.violations).toHaveLength(0)
    expect(r.couldNotEvaluate).toHaveLength(1)
  })
})

describe('evaluate — denyIfReachableAttr (traverse + attr check)', () => {
  const noAwsManagedKmsRule: Rule = {
    id: 'no-aws-managed-kms',
    target: { kind: 'resource', types: ['aws_s3_bucket'] as never },
    conditions: [
      {
        kind: 'denyIfReachableAttr',
        targetType: 'aws_kms_key' as never,
        attr: 'key_manager' as never,
        values: ['AWS'],
        direction: 'both',
      },
    ],
    effect: Effect.Block,
    message: 'Buckets must use customer-managed KMS keys',
  }

  it('violates when a bucket reaches a KMS key with key_manager = AWS', () => {
    const resources: NormalizedResource[] = [
      res('aws_s3_bucket', 'data', {
        kms_master_key_id: ref('${aws_kms_key.key.id}', 'aws_kms_key', 'key'),
      }),
      res('aws_kms_key', 'key', {
        key_manager: { kind: 'literal', value: 'AWS' },
      }),
    ]
    const r = evaluate([noAwsManagedKmsRule], resources)
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.resource).toBe('aws_s3_bucket.data')
    // The violation detail includes the KMS-key chain (path detail).
    expect(r.violations[0]?.detail).toMatch(/aws_kms_key\.key/)
  })

  it('passes when the KMS key is customer-managed (key_manager != AWS)', () => {
    const resources: NormalizedResource[] = [
      res('aws_s3_bucket', 'data', {
        kms_master_key_id: ref('${aws_kms_key.key.id}', 'aws_kms_key', 'key'),
      }),
      res('aws_kms_key', 'key', {
        key_manager: { kind: 'literal', value: 'CUSTOMER_MANAGED' },
      }),
    ]
    const r = evaluate([noAwsManagedKmsRule], resources)
    expect(r.violations).toHaveLength(0)
  })

  it('passes when the bucket has no KMS key (not reachable)', () => {
    const resources: NormalizedResource[] = [
      res('aws_s3_bucket', 'data', {
        bucket: { kind: 'literal', value: 'my-data' },
      }),
    ]
    const r = evaluate([noAwsManagedKmsRule], resources)
    expect(r.violations).toHaveLength(0)
  })

  it('degrades to couldNotEvaluate when the KMS key ref is unresolvable', () => {
    const resources: NormalizedResource[] = [
      res('aws_s3_bucket', 'data', {
        kms_master_key_id: { kind: 'unresolved', expr: '${var.key_id}' },
      }),
    ]
    const r = evaluate([noAwsManagedKmsRule], resources)
    expect(r.violations).toHaveLength(0)
    expect(r.couldNotEvaluate).toHaveLength(1)
  })
})

describe('evaluate — denyIfReachable with list-valued SG refs', () => {
  // The real-Terraform SG shape: `vpc_security_group_ids = [aws_sg.id]` is a
  // LIST, not a scalar. The graph must traverse list items for the SG-shared
  // rule to fire on real configs (not just hand-modeled scalar refs).
  const noSharedSgRule: Rule = {
    id: 'no-sg-shared-lb-db-list',
    target: { kind: 'resource', types: ['aws_db_instance'] as never },
    conditions: [
      {
        kind: 'denyIfSharedWith',
        sharedType: 'aws_security_group' as never,
        otherType: 'aws_lb' as never,
      },
    ],
    effect: Effect.Block,
    message: 'DB security groups must not be shared with load balancers',
  }

  const withLists = (
    r: NormalizedResource,
    lists: Record<string, ListInfo>,
  ): NormalizedResource => ({ ...r, lists })

  it('violates when a DB and an LB share an SG via list-valued refs', () => {
    const resources: NormalizedResource[] = [
      withLists(res('aws_db_instance', 'db'), {
        vpc_security_group_ids: {
          kind: 'resolved',
          items: [
            ref(
              '${aws_security_group.shared.id}',
              'aws_security_group',
              'shared',
            ),
          ],
        },
      }),
      withLists(res('aws_lb', 'public_lb'), {
        security_groups: {
          kind: 'resolved',
          items: [
            ref(
              '${aws_security_group.shared.id}',
              'aws_security_group',
              'shared',
            ),
          ],
        },
      }),
      res('aws_security_group', 'shared'),
    ]
    const r = evaluate([noSharedSgRule], resources)
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.resource).toBe('aws_db_instance.db')
    expect(r.violations[0]?.detail).toMatch(/aws_security_group\.shared/)
    expect(r.violations[0]?.detail).toMatch(/aws_lb\.public_lb/)
  })
})

describe('evaluate — Azure VM → NIC → public IP (cross-cloud graph rule)', () => {
  const noVmPublicIpRule: Rule = {
    id: 'no-vm-public-ip-reachable',
    target: {
      kind: 'resource',
      types: [
        'azurerm_linux_virtual_machine',
        'azurerm_windows_virtual_machine',
        'azurerm_virtual_machine',
      ] as never,
    },
    conditions: [
      {
        kind: 'denyIfReachable',
        targetType: 'azurerm_public_ip' as never,
      },
    ],
    effect: Effect.Warn,
    message: 'Virtual machines should not be directly reachable to a public IP',
  }

  const withLists = (
    r: NormalizedResource,
    lists: Record<string, ListInfo>,
  ): NormalizedResource => ({ ...r, lists })

  it('warns when a VM reaches a public IP through its NIC', () => {
    const resources: NormalizedResource[] = [
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
    const r = evaluate([noVmPublicIpRule], resources)
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.resource).toBe('azurerm_linux_virtual_machine.vm')
    expect(r.violations[0]?.detail).toMatch(/azurerm_public_ip\.pub/)
  })

  it('passes when the VM NIC has no public IP', () => {
    const resources: NormalizedResource[] = [
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
    ]
    const r = evaluate([noVmPublicIpRule], resources)
    expect(r.violations).toHaveLength(0)
  })

  it('degrades to couldNotEvaluate when the NIC ref is an opaque var', () => {
    const resources: NormalizedResource[] = [
      withLists(res('azurerm_linux_virtual_machine', 'vm'), {
        network_interface_ids: { kind: 'unresolved' },
      }),
    ]
    const r = evaluate([noVmPublicIpRule], resources)
    expect(r.violations).toHaveLength(0)
    expect(r.couldNotEvaluate).toHaveLength(1)
  })
})
