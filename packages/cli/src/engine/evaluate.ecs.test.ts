import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { Rule } from '../spec/rule'
import { NormalizedResource, ContainerInfo } from '../hcl/model'
import { AwsResource, Effect } from '../vocabulary'

const taskDef = (containers?: ContainerInfo): NormalizedResource => ({
  type: AwsResource.EcsTaskDefinition,
  name: 't',
  file: 'main.tf',
  line: 1,
  ingress: [],
  tags: { kind: 'resolved', keys: [] },
  attributes: {},
  containers,
})

const rule: Rule = {
  id: 'no-privileged',
  target: { kind: 'resource', types: [AwsResource.EcsTaskDefinition] },
  conditions: [{ kind: 'denyPrivilegedContainers' }],
  effect: Effect.Block,
  message: 'no privileged containers',
}

describe('evaluate (denyPrivilegedContainers)', () => {
  it('flags a privileged container', () => {
    const r = taskDef({
      kind: 'parsed',
      containers: [
        { name: 'app', privileged: false },
        { name: 'sidecar', privileged: true },
      ],
    })
    expect(evaluate([rule], [r]).violations).toHaveLength(1)
  })

  it('passes when no container is privileged', () => {
    const r = taskDef({
      kind: 'parsed',
      containers: [{ name: 'app', privileged: false }],
    })
    expect(evaluate([rule], [r]).violations).toHaveLength(0)
  })

  it('could-not-evaluate for a jsonencode/var container_definitions', () => {
    const r = evaluate([rule], [taskDef({ kind: 'unresolved' })])
    expect(r.couldNotEvaluate).toHaveLength(1)
  })

  it('passes when there are no container_definitions', () => {
    expect(evaluate([rule], [taskDef(undefined)]).violations).toHaveLength(0)
  })
})
