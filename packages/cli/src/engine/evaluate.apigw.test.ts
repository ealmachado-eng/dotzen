import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { normalize } from '../hcl/normalize'
import { Rule } from '../spec/rule'
import { NormalizedResource, NormalizedValue } from '../hcl/model'
import {
  AwsResource,
  AwsAttribute,
  AzureResource,
  AzureAttribute,
  ApiGatewayAuthorization,
  Block,
  Effect,
} from '../vocabulary'

const str = (v: string): NormalizedValue => ({ kind: 'literal', value: v })

describe('evaluate — AWS API Gateway', () => {
  it('flags an unauthenticated method (authorization = NONE)', () => {
    const rule: Rule = {
      id: 'authz',
      target: { kind: 'resource', types: [AwsResource.ApiGatewayMethod] },
      conditions: [
        {
          kind: 'denyValue',
          attr: AwsAttribute.Authorization,
          values: [ApiGatewayAuthorization.None],
        },
      ],
      effect: Effect.Warn,
      message: 'authz',
    }
    const method = (auth: string): NormalizedResource => ({
      type: AwsResource.ApiGatewayMethod,
      name: 'm',
      file: 'main.tf',
      line: 1,
      ingress: [],
      tags: { kind: 'resolved', keys: [] },
      attributes: { authorization: str(auth) },
    })
    expect(evaluate([rule], [method('NONE')]).violations).toHaveLength(1)
    expect(evaluate([rule], [method('AWS_IAM')]).violations).toHaveLength(0)
  })

  it('flags a stage with no access_log_settings block', () => {
    const rule: Rule = {
      id: 'log',
      target: { kind: 'resource', types: [AwsResource.ApiGatewayStage] },
      conditions: [{ kind: 'mustHaveBlock', block: Block.AccessLogSettings }],
      effect: Effect.Warn,
      message: 'logging',
    }
    const withLog = normalize(
      {
        resource: {
          aws_api_gateway_stage: {
            good: [{ access_log_settings: [{ format: 'x' }] }],
          },
        },
      },
      'main.tf',
      '',
    )
    const without = normalize(
      {
        resource: { aws_api_gateway_stage: { bad: [{ stage_name: 'prod' }] } },
      },
      'main.tf',
      '',
    )
    expect(evaluate([rule], without).violations).toHaveLength(1)
    expect(evaluate([rule], withLog).violations).toHaveLength(0)
  })
})

describe('evaluate — Azure API Management legacy TLS', () => {
  it('flags enabled legacy frontend TLS 1.0 (nested denyWhenTrue)', () => {
    const rule: Rule = {
      id: 'tls',
      target: { kind: 'resource', types: [AzureResource.ApiManagement] },
      conditions: [
        { kind: 'denyWhenTrue', attrs: [AzureAttribute.EnableFrontendTls10] },
      ],
      effect: Effect.Block,
      message: 'no legacy tls',
    }
    const apim = normalize(
      {
        resource: {
          azurerm_api_management: {
            bad: [{ security: [{ enable_frontend_tls10: true }] }],
          },
        },
      },
      'main.tf',
      '',
    )
    expect(evaluate([rule], apim).violations).toHaveLength(1)
  })
})
