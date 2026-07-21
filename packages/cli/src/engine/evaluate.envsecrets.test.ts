import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { rule, Rule } from '../spec/rule'
import { NormalizedResource, EnvVar } from '../hcl/model'
import { normalize } from '../hcl/normalize'
import { AwsResource } from '../vocabulary'

const envSecretRule = (
  rule()
    .resource(AwsResource.EcsTaskDefinition)
    .denyPlaintextEnvSecrets()
    .message('ECS environment variables must not contain plaintext secrets')
    .rationale(
      'Use Secrets Manager / SSM Parameter Store references, not hardcoded values',
    )
    .validate(0) as { ok: true; value: Rule }
).value

const container = (
  name: string,
  environment: EnvVar[],
): NormalizedResource => ({
  type: AwsResource.EcsTaskDefinition,
  name: 'task',
  file: 'main.tf',
  line: 1,
  ingress: [],
  tags: { kind: 'resolved', keys: [] },
  attributes: {},
  containers: {
    kind: 'parsed',
    containers: [{ name, privileged: false, environment }],
  },
})

const env = (name: string, value: string, isLiteral = true): EnvVar => ({
  name,
  value,
  isLiteral,
})

describe('evaluate (denyPlaintextEnvSecrets)', () => {
  it('flags a plaintext DB_PASSWORD', () => {
    const r = evaluate(
      [envSecretRule],
      [container('app', [env('DB_PASSWORD', 'hunter2')])],
    )
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.message).toMatch(/plaintext secret/)
  })

  it('flags a plaintext API_KEY', () => {
    const r = evaluate(
      [envSecretRule],
      [container('app', [env('API_KEY', 'sk-1234')])],
    )
    expect(r.violations).toHaveLength(1)
  })

  it('flags a plaintext SECRET_TOKEN', () => {
    const r = evaluate(
      [envSecretRule],
      [container('app', [env('SECRET_TOKEN', 'abc')])],
    )
    expect(r.violations).toHaveLength(1)
  })

  it('passes a referenced DB_PASSWORD (not a literal)', () => {
    const r = evaluate(
      [envSecretRule],
      [container('app', [env('DB_PASSWORD', '${var.db_password}', false)])],
    )
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('passes a non-secret env var with a literal value', () => {
    const r = evaluate(
      [envSecretRule],
      [container('app', [env('APP_ENV', 'production')])],
    )
    expect(r.violations).toHaveLength(0)
  })

  it('passes a container with no environment variables', () => {
    const r = evaluate([envSecretRule], [container('app', [])])
    expect(r.violations).toHaveLength(0)
  })

  it('flags a plaintext secret in a mixed env (some literal, some referenced)', () => {
    // This is the key case the lenient parser enables: a container with
    // both a hardcoded secret (DB_PASSWORD) and a referenced secret (API_KEY).
    // Before the lenient parser, the ${var.api_key} reference would make the
    // whole container_definitions unresolved → couldNotEvaluate, missing the
    // hardcoded DB_PASSWORD.
    const r = evaluate(
      [envSecretRule],
      [
        container('app', [
          env('DB_PASSWORD', 'hunter2'), // literal — VIOLATION
          env('API_KEY', '${var.api_key}', false), // reference — OK
        ]),
      ],
    )
    expect(r.violations).toHaveLength(1)
  })

  it('could-not-evaluate for an unresolved container_definitions', () => {
    const r = evaluate(
      [envSecretRule],
      [
        {
          ...container('app', []),
          containers: { kind: 'unresolved' },
        },
      ],
    )
    expect(r.violations).toHaveLength(0)
    expect(r.couldNotEvaluate).toHaveLength(1)
  })

  it('passes a resource with no container_definitions', () => {
    const r = evaluate(
      [envSecretRule],
      [
        {
          type: AwsResource.EcsTaskDefinition,
          name: 't',
          file: 'main.tf',
          line: 1,
          ingress: [],
          tags: { kind: 'resolved', keys: [] },
          attributes: {},
        },
      ],
    )
    expect(r.violations).toHaveLength(0)
  })
})

describe('evaluate (denyPlaintextEnvSecrets) — end-to-end through normalize', () => {
  it('flags a jsonencode task with a plaintext secret', () => {
    const parsed = {
      resource: {
        aws_ecs_task_definition: {
          bad: [
            {
              container_definitions:
                '${jsonencode([{ name = "app", environment = [{ name = "DB_PASSWORD", value = "hunter2" }] }])}',
            },
          ],
        },
      },
    }
    const resources = normalize(parsed, 'main.tf', '', undefined as never)
    const report = evaluate([envSecretRule], resources)
    expect(report.violations).toHaveLength(1)
    expect(report.couldNotEvaluate).toHaveLength(0)
  })

  it('passes a jsonencode task with a referenced secret (mixed env)', () => {
    // The lenient parser keeps ${var.db_password} as-is → isLiteral=false → no violation.
    const parsed = {
      resource: {
        aws_ecs_task_definition: {
          good: [
            {
              container_definitions:
                '${jsonencode([{ name = "app", environment = [{ name = "APP_ENV", value = "prod" }, { name = "DB_PASSWORD", value = "${var.db_password}" }] }])}',
            },
          ],
        },
      },
    }
    const resources = normalize(parsed, 'main.tf', '', undefined as never)
    const report = evaluate([envSecretRule], resources)
    expect(report.violations).toHaveLength(0)
    expect(report.passed).toBe(1)
  })

  it('flags a plaintext secret in a mixed jsonencode env', () => {
    // DB_PASSWORD is a literal, API_KEY is a reference — the lenient parser
    // extracts both, and the evaluator flags only the literal secret.
    const parsed = {
      resource: {
        aws_ecs_task_definition: {
          mixed: [
            {
              container_definitions:
                '${jsonencode([{ name = "app", environment = [{ name = "DB_PASSWORD", value = "hunter2" }, { name = "API_KEY", value = "${var.api_key}" }] }])}',
            },
          ],
        },
      },
    }
    const resources = normalize(parsed, 'main.tf', '', undefined as never)
    const report = evaluate([envSecretRule], resources)
    expect(report.violations).toHaveLength(1)
    expect(report.couldNotEvaluate).toHaveLength(0)
  })
})
