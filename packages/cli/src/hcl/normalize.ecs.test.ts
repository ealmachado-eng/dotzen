import { describe, it, expect } from 'vitest'
import { normalize } from './normalize'
import { AwsResource } from '../vocabulary'

const raw = `resource "aws_ecs_task_definition" "x" {}`

const literalDefinitions = JSON.stringify([
  { name: 'app', image: 'app:latest', privileged: false },
  { name: 'sidecar', image: 'sidecar:latest', privileged: true },
])

const parsed = {
  resource: {
    aws_ecs_task_definition: {
      literal: [{ container_definitions: literalDefinitions }],
      encoded_priv: [
        {
          container_definitions:
            '${jsonencode([{ name = "app", image = "app:latest", privileged = true }])}',
        },
      ],
      encoded_unpriv: [
        {
          container_definitions:
            '${jsonencode([{ name = "app", image = "app:latest", privileged = false }])}',
        },
      ],
      encoded_multiline: [
        {
          container_definitions:
            '${jsonencode([\n    { name = "app", image = "app:latest", privileged = true }\n  ])}',
        },
      ],
      encoded_var: [{ container_definitions: '${jsonencode(var.containers)}' }],
      none: [{ family: 'no-containers' }],
    },
  },
}

describe('normalize — ECS container_definitions parsing', () => {
  const by = (n: string) =>
    normalize(parsed, 'main.tf', raw).find((r) => r.name === n)

  it('parses a literal-JSON container_definitions array', () => {
    const c = by('literal')?.containers
    expect(c?.kind).toBe('parsed')
    if (c?.kind === 'parsed') {
      expect(c.containers).toHaveLength(2)
      expect(c.containers[0]).toMatchObject({ name: 'app', privileged: false })
      expect(c.containers[1]).toMatchObject({
        name: 'sidecar',
        privileged: true,
      })
    }
  })

  it('parses a jsonencode(...) container_definitions with a privileged container', () => {
    const c = by('encoded_priv')?.containers
    expect(c?.kind).toBe('parsed')
    if (c?.kind === 'parsed') {
      expect(c.containers).toHaveLength(1)
      expect(c.containers[0]).toMatchObject({ name: 'app', privileged: true })
    }
  })

  it('parses a jsonencode(...) container_definitions with no privileged container', () => {
    const c = by('encoded_unpriv')?.containers
    expect(c?.kind).toBe('parsed')
    if (c?.kind === 'parsed')
      expect(c.containers[0]).toMatchObject({ name: 'app', privileged: false })
  })

  it('parses a multi-line jsonencode(...) container_definitions', () => {
    const c = by('encoded_multiline')?.containers
    expect(c?.kind).toBe('parsed')
    if (c?.kind === 'parsed')
      expect(c.containers[0]).toMatchObject({ name: 'app', privileged: true })
  })

  it('marks jsonencode(var.x) container_definitions as unresolved', () => {
    expect(by('encoded_var')?.containers).toEqual({ kind: 'unresolved' })
  })

  it('leaves containers undefined when there is no container_definitions', () => {
    expect(by('none')?.containers).toBeUndefined()
  })

  it('assigns the correct resource type', () => {
    expect(by('literal')?.type).toBe(AwsResource.EcsTaskDefinition)
  })
})
