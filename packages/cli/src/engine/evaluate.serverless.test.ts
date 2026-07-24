import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { normalize } from '../hcl/normalize'
import { rule, Rule } from '../spec/rule'
import {
  AwsResource,
  AwsAttribute,
  AzureResource,
  AzureAttribute,
  GcpResource,
  GcpAttribute,
  Block,
  XrayMode,
  SqlTlsVersion,
  IngressSetting,
} from '../vocabulary'

const asRule = (b: ReturnType<typeof rule>): Rule =>
  (b.validate(0) as { ok: true; value: Rule }).value

const lambdaRule = asRule(
  rule()
    .resource(AwsResource.LambdaFunction)
    .denyPlaintextEnvSecrets()
    .message('Lambda env vars must not contain plaintext secrets'),
)

const lambdaTrace = asRule(
  rule()
    .resource(AwsResource.LambdaFunction)
    .mustEqual(AwsAttribute.TracingMode, XrayMode.Active)
    .message('Lambda must use Active tracing'),
)

const lambdaKms = asRule(
  rule()
    .resource(AwsResource.LambdaFunction)
    .mustBeSet(AwsAttribute.LambdaKmsKeyArn)
    .message('Lambda must set a KMS key for env var encryption'),
)

const azureHttps = asRule(
  rule()
    .resource(AzureResource.LinuxFunctionApp)
    .mustBeTrue(AzureAttribute.HttpsOnly)
    .message('Azure Functions must enforce HTTPS-only'),
)

const azureTls = asRule(
  rule()
    .resource(AzureResource.LinuxFunctionApp)
    .mustEqual(AzureAttribute.SiteConfigMinTlsVersion, SqlTlsVersion.V12)
    .message('Azure Functions must require TLS 1.2'),
)

const azurePub = asRule(
  rule()
    .resource(AzureResource.LinuxFunctionApp)
    .denyWhenTrue(AzureAttribute.PublicNetworkAccessEnabled)
    .message('Azure Functions must not expose public network access'),
)

const azureIdentity = asRule(
  rule()
    .resource(AzureResource.LinuxFunctionApp)
    .mustHaveBlock(Block.Identity)
    .message('Azure Functions must declare a managed identity block'),
)

const azureEnv = asRule(
  rule()
    .resource(AzureResource.LinuxFunctionApp)
    .denyPlaintextEnvSecrets()
    .message('Azure Functions app_settings must not contain plaintext secrets'),
)

const gcpIngress = asRule(
  rule()
    .resource(GcpResource.Cloudfunctions2Function)
    .denyValue(GcpAttribute.IngressSettings, IngressSetting.AllowAll)
    .message('Cloud Run Functions must not allow unrestricted ingress'),
)

const gcpSa = asRule(
  rule()
    .resource(GcpResource.Cloudfunctions2Function)
    .mustBeSet(GcpAttribute.ServiceAccountEmail)
    .message('Cloud Run Functions must set a runtime service account'),
)

const gcpEnv = asRule(
  rule()
    .resource(GcpResource.Cloudfunctions2Function)
    .denyPlaintextEnvSecrets()
    .message('Cloud Run Functions env vars must not contain plaintext secrets'),
)

const lambda = (overrides: Record<string, unknown> = {}) => ({
  resource: {
    aws_lambda_function: {
      fn: [
        {
          runtime: 'nodejs20.x',
          handler: 'index.handler',
          ...overrides,
        },
      ],
    },
  },
})

const azureFn = (overrides: Record<string, unknown> = {}) => ({
  resource: {
    azurerm_linux_function_app: {
      fn: [
        {
          name: 'fn',
          resource_group_name: 'rg',
          service_plan_id: 'plan',
          ...overrides,
        },
      ],
    },
  },
})

const gcpFn = (overrides: Record<string, unknown> = {}) => ({
  resource: {
    google_cloudfunctions2_function: {
      fn: [
        {
          name: 'fn',
          location: 'us-central1',
          ...overrides,
        },
      ],
    },
  },
})

const rawFor = (type: string) => `resource "${type}" "fn" {}`

describe('evaluate (serverless) — AWS Lambda', () => {
  it('flags a plaintext secret in Lambda environment.variables', () => {
    const resources = normalize(
      lambda({
        environment: [
          {
            variables: {
              APP_ENV: 'production',
              DB_PASSWORD: 'hunter2',
            },
          },
        ],
      }),
      'main.tf',
      rawFor('aws_lambda_function'),
    )
    const r = evaluate([lambdaRule], resources)
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.message).toMatch(/plaintext secret/)
  })

  it('passes a referenced Lambda secret', () => {
    const resources = normalize(
      lambda({
        environment: [
          {
            variables: {
              APP_ENV: 'production',
              DB_PASSWORD: '${var.db_password}',
            },
          },
        ],
      }),
      'main.tf',
      rawFor('aws_lambda_function'),
    )
    const r = evaluate([lambdaRule], resources)
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('flags Lambda tracing_config.mode != Active', () => {
    const resources = normalize(
      lambda({ tracing_config: [{ mode: 'PassThrough' }] }),
      'main.tf',
      rawFor('aws_lambda_function'),
    )
    const r = evaluate([lambdaTrace], resources)
    expect(r.violations).toHaveLength(1)
  })

  it('passes Lambda tracing_config.mode = Active', () => {
    const resources = normalize(
      lambda({ tracing_config: [{ mode: 'Active' }] }),
      'main.tf',
      rawFor('aws_lambda_function'),
    )
    const r = evaluate([lambdaTrace], resources)
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('flags Lambda with no kms_key_arn (mustBeSet)', () => {
    const resources = normalize(lambda(), 'main.tf', rawFor('aws_lambda_function'))
    const r = evaluate([lambdaKms], resources)
    expect(r.violations).toHaveLength(1)
  })

  it('passes Lambda with kms_key_arn set', () => {
    const resources = normalize(
      lambda({ kms_key_arn: 'arn:aws:kms:us-east-1:1:key/abc' }),
      'main.tf',
      rawFor('aws_lambda_function'),
    )
    const r = evaluate([lambdaKms], resources)
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })
})

describe('evaluate (serverless) — Azure Functions', () => {
  it('flags https_only = false', () => {
    const resources = normalize(
      azureFn({ https_only: false }),
      'main.tf',
      rawFor('azurerm_linux_function_app'),
    )
    const r = evaluate([azureHttps], resources)
    expect(r.violations).toHaveLength(1)
  })

  it('passes https_only = true', () => {
    const resources = normalize(
      azureFn({ https_only: true }),
      'main.tf',
      rawFor('azurerm_linux_function_app'),
    )
    const r = evaluate([azureHttps], resources)
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('flags site_config.minimum_tls_version < 1.2', () => {
    const resources = normalize(
      azureFn({ site_config: [{ minimum_tls_version: '1.0' }] }),
      'main.tf',
      rawFor('azurerm_linux_function_app'),
    )
    const r = evaluate([azureTls], resources)
    expect(r.violations).toHaveLength(1)
  })

  it('passes site_config.minimum_tls_version = 1.2', () => {
    const resources = normalize(
      azureFn({ site_config: [{ minimum_tls_version: '1.2' }] }),
      'main.tf',
      rawFor('azurerm_linux_function_app'),
    )
    const r = evaluate([azureTls], resources)
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('flags public_network_access_enabled = true', () => {
    const resources = normalize(
      azureFn({ public_network_access_enabled: true }),
      'main.tf',
      rawFor('azurerm_linux_function_app'),
    )
    const r = evaluate([azurePub], resources)
    expect(r.violations).toHaveLength(1)
  })

  it('flags a missing identity block (mustHaveBlock)', () => {
    const resources = normalize(
      azureFn({ https_only: true }),
      'main.tf',
      rawFor('azurerm_linux_function_app'),
    )
    const r = evaluate([azureIdentity], resources)
    expect(r.violations).toHaveLength(1)
  })

  it('passes with an identity block present', () => {
    const resources = normalize(
      azureFn({ identity: [{ type: 'SystemAssigned' }] }),
      'main.tf',
      rawFor('azurerm_linux_function_app'),
    )
    const r = evaluate([azureIdentity], resources)
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('flags a plaintext secret in app_settings', () => {
    const resources = normalize(
      azureFn({
        app_settings: {
          APP_ENV: 'production',
          API_KEY: 'sk-1234',
        },
      }),
      'main.tf',
      rawFor('azurerm_linux_function_app'),
    )
    const r = evaluate([azureEnv], resources)
    expect(r.violations).toHaveLength(1)
  })

  it('passes a referenced app_settings secret', () => {
    const resources = normalize(
      azureFn({
        app_settings: {
          APP_ENV: 'production',
          API_KEY: '${var.api_key}',
        },
      }),
      'main.tf',
      rawFor('azurerm_linux_function_app'),
    )
    const r = evaluate([azureEnv], resources)
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })
})

describe('evaluate (serverless) — GCP Cloud Run Functions', () => {
  it('flags ingress_settings = ALLOW_ALL', () => {
    const resources = normalize(
      gcpFn({
        service_config: [{ ingress_settings: 'ALLOW_ALL' }],
      }),
      'main.tf',
      rawFor('google_cloudfunctions2_function'),
    )
    const r = evaluate([gcpIngress], resources)
    expect(r.violations).toHaveLength(1)
  })

  it('passes ingress_settings = ALLOW_INTERNAL_AND_GCLB', () => {
    const resources = normalize(
      gcpFn({
        service_config: [{ ingress_settings: 'ALLOW_INTERNAL_AND_GCLB' }],
      }),
      'main.tf',
      rawFor('google_cloudfunctions2_function'),
    )
    const r = evaluate([gcpIngress], resources)
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('flags a missing service_account_email (mustBeSet)', () => {
    const resources = normalize(
      gcpFn({ service_config: [{ ingress_settings: 'ALLOW_INTERNAL_AND_GCLB' }] }),
      'main.tf',
      rawFor('google_cloudfunctions2_function'),
    )
    const r = evaluate([gcpSa], resources)
    expect(r.violations).toHaveLength(1)
  })

  it('passes with service_account_email set', () => {
    const resources = normalize(
      gcpFn({
        service_config: [
          {
            ingress_settings: 'ALLOW_INTERNAL_AND_GCLB',
            service_account_email: 'fn@proj.iam.gserviceaccount.com',
          },
        ],
      }),
      'main.tf',
      rawFor('google_cloudfunctions2_function'),
    )
    const r = evaluate([gcpSa], resources)
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('flags a plaintext secret in service_config.environment_variables', () => {
    const resources = normalize(
      gcpFn({
        service_config: [
          {
            ingress_settings: 'ALLOW_INTERNAL_AND_GCLB',
            environment_variables: {
              APP_ENV: 'production',
              DB_PASSWORD: 'hunter2',
            },
          },
        ],
      }),
      'main.tf',
      rawFor('google_cloudfunctions2_function'),
    )
    const r = evaluate([gcpEnv], resources)
    expect(r.violations).toHaveLength(1)
  })

  it('passes a referenced Cloud Run Functions secret', () => {
    const resources = normalize(
      gcpFn({
        service_config: [
          {
            ingress_settings: 'ALLOW_INTERNAL_AND_GCLB',
            environment_variables: {
              APP_ENV: 'production',
              DB_PASSWORD: '${var.db_password}',
            },
          },
        ],
      }),
      'main.tf',
      rawFor('google_cloudfunctions2_function'),
    )
    const r = evaluate([gcpEnv], resources)
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })
})
