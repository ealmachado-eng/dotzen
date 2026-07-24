import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { rule, Rule } from '../spec/rule'
import { normalize } from '../hcl/normalize'
import { AwsResource, Provisioner, Effect } from '../vocabulary'

// Validate a builder into a Rule (the unwrapping cast mirrors evaluate.ssl.test).
const valid = (b: ReturnType<typeof rule>): Rule =>
  (b.validate(0) as { ok: true; value: Rule }).value

const sg = (provisioners?: string[]) =>
  ({
    type: AwsResource.SecurityGroup,
    name: 'web',
    file: 'main.tf',
    line: 1,
    ingress: [],
    tags: { kind: 'resolved', keys: [] },
    attributes: {},
    provisioners,
  }) as never

describe('evaluate (denyProvisioner)', () => {
  it('flags a resource declaring a denied provisioner', () => {
    const res = evaluate(
      [
        valid(
          rule()
            .resource(AwsResource.SecurityGroup)
            .denyProvisioner(Provisioner.LocalExec)
            .message('no local-exec'),
        ),
      ],
      [sg(['local-exec', 'remote-exec'])],
    )
    expect(res.violations).toHaveLength(1)
    expect(res.violations[0]?.message).toMatch(/no local-exec/)
  })

  it('flags only the denied types, not other declared provisioners', () => {
    const res = evaluate(
      [
        valid(
          rule()
            .resource(AwsResource.SecurityGroup)
            .denyProvisioner(Provisioner.RemoteExec)
            .message('no remote-exec'),
        ),
      ],
      [sg(['local-exec'])],
    )
    // local-exec declared but only remote-exec denied → pass (no violation).
    expect(res.violations).toHaveLength(0)
    expect(res.passed).toBe(1)
  })

  it('passes a resource with no provisioners', () => {
    const res = evaluate(
      [
        valid(
          rule()
            .resource(AwsResource.SecurityGroup)
            .denyProvisioner(Provisioner.LocalExec, Provisioner.RemoteExec)
            .message('no provisioners'),
        ),
      ],
      [sg(undefined)],
    )
    expect(res.violations).toHaveLength(0)
    expect(res.passed).toBe(1)
  })

  it('passes a resource with an empty provisioners list', () => {
    const res = evaluate(
      [
        valid(
          rule()
            .resource(AwsResource.SecurityGroup)
            .denyProvisioner(Provisioner.LocalExec)
            .message('no local-exec'),
        ),
      ],
      [sg([])],
    )
    expect(res.violations).toHaveLength(0)
  })

  it('denies both when both are listed', () => {
    const res = evaluate(
      [
        valid(
          rule()
            .resource(AwsResource.SecurityGroup)
            .denyProvisioner(Provisioner.LocalExec, Provisioner.RemoteExec)
            .message('no provisioners at all'),
        ),
      ],
      [sg(['local-exec', 'remote-exec'])],
    )
    expect(res.violations).toHaveLength(1)
    expect(res.violations[0]?.effect).toBe(Effect.Block)
  })

  it('accepts org-specific provisioner names (string & {})', () => {
    const res = evaluate(
      [
        valid(
          rule()
            .resource(AwsResource.SecurityGroup)
            .denyProvisioner('custom-exec')
            .message('no custom-exec'),
        ),
      ],
      [sg(['custom-exec'])],
    )
    expect(res.violations).toHaveLength(1)
  })
})

describe('evaluate (denyProvisioner) — end-to-end through normalize', () => {
  const raw = `resource "aws_instance" "x" {
  ami = "ami-1"
  provisioner "local-exec" {
    command = "echo hi"
  }
  provisioner "remote-exec" {
    inline = ["whoami"]
  }
}

resource "aws_instance" "clean" {
  ami = "ami-2"
}`

  const parsed = {
    resource: {
      aws_instance: {
        x: [
          {
            ami: 'ami-1',
            provisioner: {
              'local-exec': [{ command: 'echo hi' }],
              'remote-exec': [{ inline: ['whoami'] }],
            },
          },
        ],
        clean: [{ ami: 'ami-2' }],
      },
    },
  }

  it('normalize extracts declared provisioner type names (sorted)', () => {
    const res = normalize(parsed as never, 'main.tf', raw)
    const x = res.find((r) => r.name === 'x')
    expect(x?.provisioners).toEqual(['local-exec', 'remote-exec'])
    const clean = res.find((r) => r.name === 'clean')
    expect(clean?.provisioners).toEqual([])
  })

  it('flags the provisionered instance and passes the clean one', () => {
    const res = normalize(parsed as never, 'main.tf', raw)
    const report = evaluate(
      [
        valid(
          rule()
            .resource(AwsResource.Instance)
            .denyProvisioner(Provisioner.LocalExec, Provisioner.RemoteExec)
            .message(
              'provisioners are forbidden — use user_data / config managers',
            ),
        ),
      ],
      res,
    )
    expect(report.violations).toHaveLength(1)
    expect(report.violations[0]?.resource).toBe('aws_instance.x')
    expect(report.passed).toBe(1) // the clean instance
  })
})
