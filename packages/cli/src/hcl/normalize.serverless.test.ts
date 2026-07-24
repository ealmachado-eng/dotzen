import { describe, it, expect } from 'vitest'
import { normalize } from './normalize'

const lambdaRaw = `resource "aws_lambda_function" "f" {}`
const azureRaw = `resource "azurerm_linux_function_app" "f" {}`
const gcpRaw = `resource "google_cloudfunctions2_function" "f" {}`

describe('normalize — serverless env-var map extraction', () => {
  it('extracts aws_lambda_function environment.variables (literal + reference)', () => {
    const parsed = {
      resource: {
        aws_lambda_function: {
          f: [
            {
              environment: [
                {
                  variables: {
                    APP_ENV: 'production',
                    DB_PASSWORD: 'hunter2',
                    API_KEY: '${var.api_key}',
                  },
                },
              ],
            },
          ],
        },
      },
    }
    const f = normalize(parsed, 'main.tf', lambdaRaw).find(
      (r) => r.name === 'f',
    )
    expect(f?.envVars?.kind).toBe('parsed')
    if (f?.envVars?.kind === 'parsed') {
      const byName = new Map(f.envVars.vars.map((v) => [v.name, v]))
      expect(byName.get('APP_ENV')?.isLiteral).toBe(true)
      expect(byName.get('DB_PASSWORD')?.isLiteral).toBe(true)
      expect(byName.get('API_KEY')?.isLiteral).toBe(false)
    }
  })

  it('extracts azurerm_linux_function_app app_settings', () => {
    const parsed = {
      resource: {
        azurerm_linux_function_app: {
          f: [
            {
              app_settings: {
                APP_ENV: 'production',
                SECRET_TOKEN: 'abc',
                API_KEY: '${var.api_key}',
              },
            },
          ],
        },
      },
    }
    const f = normalize(parsed, 'main.tf', azureRaw).find((r) => r.name === 'f')
    expect(f?.envVars?.kind).toBe('parsed')
    if (f?.envVars?.kind === 'parsed') {
      const byName = new Map(f.envVars.vars.map((v) => [v.name, v]))
      expect(byName.get('SECRET_TOKEN')?.isLiteral).toBe(true)
      expect(byName.get('API_KEY')?.isLiteral).toBe(false)
    }
  })

  it('extracts google_cloudfunctions2_function service_config.environment_variables', () => {
    const parsed = {
      resource: {
        google_cloudfunctions2_function: {
          f: [
            {
              service_config: [
                {
                  environment_variables: {
                    APP_ENV: 'production',
                    DB_PASSWORD: 'hunter2',
                    API_KEY: '${var.api_key}',
                  },
                },
              ],
            },
          ],
        },
      },
    }
    const f = normalize(parsed, 'main.tf', gcpRaw).find((r) => r.name === 'f')
    expect(f?.envVars?.kind).toBe('parsed')
    if (f?.envVars?.kind === 'parsed') {
      const byName = new Map(f.envVars.vars.map((v) => [v.name, v]))
      expect(byName.get('DB_PASSWORD')?.isLiteral).toBe(true)
      expect(byName.get('API_KEY')?.isLiteral).toBe(false)
    }
  })

  it('returns undefined when the function declares no env-var map', () => {
    const parsed = {
      resource: { aws_lambda_function: { f: [{ runtime: 'nodejs20.x' }] } },
    }
    const f = normalize(parsed, 'main.tf', lambdaRaw).find(
      (r) => r.name === 'f',
    )
    expect(f?.envVars).toBeUndefined()
  })

  it('marks a whole-map reference (app_settings = var.x) as unresolved', () => {
    const parsed = {
      resource: {
        azurerm_linux_function_app: {
          f: [{ app_settings: '${var.app_settings}' }],
        },
      },
    }
    const f = normalize(parsed, 'main.tf', azureRaw).find((r) => r.name === 'f')
    expect(f?.envVars).toEqual({ kind: 'unresolved' })
  })

  it('returns undefined for a non-serverless resource type', () => {
    const parsed = {
      resource: {
        aws_db_instance: { d: [{ storage_encrypted: true }] },
      },
    }
    const d = normalize(
      parsed,
      'main.tf',
      `resource "aws_db_instance" "d" {}`,
    ).find((r) => r.name === 'd')
    expect(d?.envVars).toBeUndefined()
  })
})
