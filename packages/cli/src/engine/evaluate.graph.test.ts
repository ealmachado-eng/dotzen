import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { Rule } from '../spec/rule'
import { NormalizedResource, NormalizedValue } from '../hcl/model'
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
})
