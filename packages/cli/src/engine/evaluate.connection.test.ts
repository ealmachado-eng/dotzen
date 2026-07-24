import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { normalize, buildScope } from '../hcl/normalize'
import { rule, Rule } from '../spec/rule'
import { AwsResource } from '../vocabulary'

const valid = (b: ReturnType<typeof rule>): Rule =>
  (b.validate(0) as { ok: true; value: Rule }).value

const noConnSecret = valid(
  rule()
    .resource(AwsResource.Instance)
    .denyPlaintextConnectionSecret()
    .message('connection blocks must not hardcode secrets — use a reference'),
)

const raw = `resource "aws_instance" "x" {
  ami = "ami-1"
  connection {
    private_key = "-----BEGIN RSA PRIVATE KEY-----\\nMII\\n-----END RSA PRIVATE KEY-----"
    password    = "hunter2"
  }
}`

describe('evaluate (denyPlaintextConnectionSecret) — #18', () => {
  it('flags a connection block with a plaintext private_key + password', () => {
    const parsed = {
      resource: {
        aws_instance: {
          x: [
            {
              ami: 'ami-1',
              connection: [
                {
                  type: 'ssh',
                  private_key:
                    '-----BEGIN RSA PRIVATE KEY-----\nMII\n-----END RSA PRIVATE KEY-----',
                  password: 'hunter2',
                },
              ],
            },
          ],
        },
      },
    }
    const res = normalize(
      parsed as never,
      'main.tf',
      raw,
      buildScope([parsed as never]),
    )
    const r = evaluate([noConnSecret], res)
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.resource).toBe('aws_instance.x')
  })

  it('passes a connection block whose secret-shaped fields are references', () => {
    const parsed = {
      resource: {
        aws_instance: {
          x: [
            {
              ami: 'ami-1',
              connection: [
                {
                  type: 'ssh',
                  private_key: '${var.ssh_key}',
                  password:
                    '${aws_secretsmanager_secret_version.pw.secret_string}',
                },
              ],
            },
          ],
        },
      },
    }
    const res = normalize(
      parsed as never,
      'main.tf',
      raw,
      buildScope([parsed as never]),
    )
    const r = evaluate([noConnSecret], res)
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('passes a resource with no connection block', () => {
    const parsed = { resource: { aws_instance: { x: [{ ami: 'ami-1' }] } } }
    const res = normalize(
      parsed as never,
      'main.tf',
      raw,
      buildScope([parsed as never]),
    )
    const r = evaluate([noConnSecret], res)
    expect(r.violations).toHaveLength(0)
  })

  it('does not flag non-secret connection fields (host/type/user)', () => {
    const parsed = {
      resource: {
        aws_instance: {
          x: [
            {
              ami: 'ami-1',
              connection: [
                { type: 'ssh', host: '${self.public_ip}', user: 'ec2-user' },
              ],
            },
          ],
        },
      },
    }
    const res = normalize(
      parsed as never,
      'main.tf',
      raw,
      buildScope([parsed as never]),
    )
    const r = evaluate([noConnSecret], res)
    expect(r.violations).toHaveLength(0)
  })

  it('matches the full secret-name pattern (token/credential/api_key)', () => {
    const parsed = {
      resource: {
        aws_instance: {
          x: [
            {
              ami: 'ami-1',
              connection: [
                { auth_token: 'abc', api_key: 'xyz', credential: 'c' },
              ],
            },
          ],
        },
      },
    }
    const res = normalize(
      parsed as never,
      'main.tf',
      raw,
      buildScope([parsed as never]),
    )
    const r = evaluate([noConnSecret], res)
    expect(r.violations).toHaveLength(1)
  })
})
