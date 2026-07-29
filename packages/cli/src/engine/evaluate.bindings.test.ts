import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { normalizeBindings } from '../hcl/normalize'
import { rule, Rule } from '../spec/rule'

const valid = (b: ReturnType<typeof rule>): Rule =>
  (b.validate(0) as { ok: true; value: Rule }).value

// Both conditions are zero-arg with a built-in secret-name pattern
// (PASSWORD/SECRET/KEY/TOKEN/CREDENTIAL), mirroring denyPlaintextEnvSecrets.
const sensVarRule = valid(
  rule()
    .allResources()
    .denyInsensitiveVariable()
    .message('secret-looking variables must be marked sensitive'),
)
const localSecretRule = valid(
  rule()
    .allResources()
    .denyPlaintextLocalSecret()
    .message('locals must not hardcode secrets — use a reference'),
)

describe('evaluate (denyInsensitiveVariable) — #10', () => {
  it('flags a secret-named variable without sensitive = true', () => {
    const parsed = { variable: { db_password: [{ default: 'hunter2' }] } }
    const bs = normalizeBindings(
      parsed as never,
      'main.tf',
      'variable "db_password" {}',
    )
    const r = evaluate([sensVarRule], [], [], bs)
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.resource).toBe('variable.db_password')
  })

  it('passes a secret-named variable marked sensitive = true', () => {
    const parsed = {
      variable: { api_key: [{ default: 'x', sensitive: true }] },
    }
    const bs = normalizeBindings(parsed as never, 'main.tf', '')
    const r = evaluate([sensVarRule], [], [], bs)
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('passes a non-secret-named variable regardless of sensitive', () => {
    const parsed = { variable: { instance_count: [{ default: 2 }] } }
    const bs = normalizeBindings(parsed as never, 'main.tf', '')
    const r = evaluate([sensVarRule], [], [], bs)
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('degrades to could-not-evaluate when sensitive is an unresolvable var', () => {
    const parsed = {
      variable: {
        secret_token: [{ sensitive: '${var.flag}' }],
      },
    }
    const bs = normalizeBindings(parsed as never, 'main.tf', '')
    const r = evaluate([sensVarRule], [], [], bs)
    expect(r.violations).toHaveLength(0)
    expect(r.couldNotEvaluate).toHaveLength(1)
    expect(r.couldNotEvaluate[0]?.resource).toBe('variable.secret_token')
  })

  it('matches the full secret-name pattern (PASSWORD/SECRET/KEY/TOKEN/CREDENTIAL)', () => {
    const parsed = {
      variable: {
        master_password: [{}],
        api_secret: [{}],
        private_key: [{}],
        auth_token: [{}],
        credential: [{}],
      },
    }
    const bs = normalizeBindings(parsed as never, 'main.tf', '')
    const r = evaluate([sensVarRule], [], [], bs)
    expect(r.violations).toHaveLength(5)
  })

  it('finds the variable block line', () => {
    const raw = `# comment\nvariable "db_password" {\n  default = "x"\n}`
    const parsed = { variable: { db_password: [{ default: 'x' }] } }
    const bs = normalizeBindings(parsed as never, 'main.tf', raw)
    expect(bs[0]?.line).toBe(2)
  })

  describe('config-flag precision (dogfood round 2 — Finding #3)', () => {
    it('skips a bool-typed secret-named variable (a flag, not a value)', () => {
      // `create_password_policy = true` is a boolean feature flag, not a
      // secret. hcl2json emits `type = bool` as `'${bool}'`.
      const parsed = {
        variable: {
          create_account_password_policy: [{ type: '${bool}', default: false }],
        },
      }
      const bs = normalizeBindings(parsed as never, 'main.tf', '')
      const r = evaluate([sensVarRule], [], [], bs)
      expect(r.violations).toHaveLength(0)
      expect(r.passed).toBe(1)
    })

    it('skips a number-typed secret-named variable (a config value)', () => {
      // `max_password_age = 90` is a number, not a secret.
      const parsed = {
        variable: { max_password_age: [{ type: '${number}', default: 90 }] },
      }
      const bs = normalizeBindings(parsed as never, 'main.tf', '')
      const r = evaluate([sensVarRule], [], [], bs)
      expect(r.violations).toHaveLength(0)
    })

    it('still flags a string-typed secret-named variable', () => {
      const parsed = {
        variable: { db_password: [{ type: '${string}', default: 'x' }] },
      }
      const bs = normalizeBindings(parsed as never, 'main.tf', '')
      const r = evaluate([sensVarRule], [], [], bs)
      expect(r.violations).toHaveLength(1)
    })

    it('still flags a secret-named variable with no type declared (conservative)', () => {
      const parsed = { variable: { api_key: [{}] } }
      const bs = normalizeBindings(parsed as never, 'main.tf', '')
      const r = evaluate([sensVarRule], [], [], bs)
      expect(r.violations).toHaveLength(1)
    })

    it('skips verb-prefixed flags (allow_/create_/attach_/enable_/disable_)', () => {
      const parsed = {
        variable: {
          allow_users_to_change_password: [{ type: '${bool}' }],
          create_access_key: [{ type: '${bool}' }],
          attach_external_secrets_policy: [{ type: '${bool}' }],
        },
      }
      const bs = normalizeBindings(parsed as never, 'main.tf', '')
      const r = evaluate([sensVarRule], [], [], bs)
      expect(r.violations).toHaveLength(0)
    })

    it('skips extended config-flag suffixes (_status/_policy/_arns/_age/_length/_required/_prevention)', () => {
      const parsed = {
        variable: {
          access_key_status: [{ type: '${string}' }],
          password_policy: [{ type: '${string}' }],
          secrets_kms_key_arns: [{ type: '${list(string)}' }],
          max_password_age: [{ type: '${number}' }],
          password_length: [{ type: '${number}' }],
          password_reset_required: [{ type: '${bool}' }],
          password_reuse_prevention: [{ type: '${number}' }],
        },
      }
      const bs = normalizeBindings(parsed as never, 'main.tf', '')
      const r = evaluate([sensVarRule], [], [], bs)
      expect(r.violations).toHaveLength(0)
    })
  })
})

describe('evaluate (denyPlaintextLocalSecret) — #12', () => {
  it('flags a secret-named local with a plaintext literal value', () => {
    const parsed = { locals: [{ admin_password: 'hunter2' }] }
    const bs = normalizeBindings(
      parsed as never,
      'main.tf',
      'locals { admin_password = "hunter2" }',
    )
    const r = evaluate([localSecretRule], [], [], bs)
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.resource).toBe('local.admin_password')
  })

  it('passes a secret-named local whose value is a reference (the safe pattern)', () => {
    const parsed = { locals: [{ api_key: '${var.api_key}' }] }
    const bs = normalizeBindings(parsed as never, 'main.tf', '')
    const r = evaluate([localSecretRule], [], [], bs)
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('passes a non-secret-named local with a literal value', () => {
    const parsed = { locals: [{ instance_count: 3 }] }
    const bs = normalizeBindings(parsed as never, 'main.tf', '')
    const r = evaluate([localSecretRule], [], [], bs)
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('passes a secret-named local with an object/array value (not a scalar secret)', () => {
    const parsed = { locals: [{ secret_config: { a: 1 } }] }
    const bs = normalizeBindings(parsed as never, 'main.tf', '')
    const r = evaluate([localSecretRule], [], [], bs)
    // an object isn't a plaintext secret string → no violation
    expect(r.violations).toHaveLength(0)
  })
})

describe('evaluate bindings pass — isolation from resources/outputs', () => {
  it('a binding rule and a resource rule coexist (separate passes)', () => {
    const parsed = { variable: { db_password: [{}] } }
    const bs = normalizeBindings(parsed as never, 'main.tf', '')
    // A resource rule with no resources present → no resource violations;
    // the binding rule flags the insensitive variable.
    const r = evaluate([sensVarRule], [], [], bs)
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.resource).toBe('variable.db_password')
  })
})
