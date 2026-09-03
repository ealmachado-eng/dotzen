/** Public DSL surface — what `.pluvian/spec.ts` imports. */
export { rule, RuleBuilder } from './spec/rule'
export {
  AwsResource,
  Port,
  Cidr,
  Effect,
  Tag,
  AwsAttribute,
  Acl,
  Environment,
  Approver,
  HttpTokens,
  EksLogType,
  TlsPolicy,
  Protocol,
  Block,
  Provisioner,
  LifecycleAttribute,
  Wildcard,
  ApiGatewayAuthorization,
  XrayMode,
  AzureResource,
  AzureAttribute,
  StorageTlsVersion,
  SqlTlsVersion,
  BuiltInRole,
  NetworkDefaultAction,
  GcpResource,
  GcpAttribute,
  PublicAccessPreventionMode,
  IamMember,
  PrimitiveRole,
  OauthScope,
  SqlSslMode,
  IngressSetting,
  DataResource,
  DataAttribute,
} from './vocabulary'

// Curated CIS preset rule packs (#24). Spread into a spec:
//   import { cisAws } from '@erkos/pluvian'
//   export const spec = [...cisAws, /* your rules *\/]
export { cisAws } from './presets/cis-aws'
export { cisAzure } from './presets/cis-azure'
export { cisGcp } from './presets/cis-gcp'

// Composable framework presets — spread coreSecurity + a framework pack:
//   import { coreSecurity, pciDss } from '@erkos/pluvian'
//   export const spec = [...coreSecurity, ...pciDss, /* your rules *\/]
export { coreSecurity } from './presets/core-security'
export { pciDss } from './presets/pci-dss'
export { soc2 } from './presets/soc2'
export { nist80053 } from './presets/nist-800-53'
export { dataProtection } from './presets/data-protection'

// Engine API — for embedders (e.g. the VS Code extension) that run checks
// in-process against the same engine the CLI uses. Verdicts are identical
// by construction: one `check()`, two surfaces.
export { check } from './cli/check'
export type { CheckOptions } from './cli/check'
export type { CheckReport, Violation, Unevaluable } from './engine/evaluate'
export type { EngineError, RuleValidationError } from './result/errors'
export type { Result } from './result/result'
export { readEngineConfig } from './version/config'
export type {
  EngineConfig,
  LoadedConfig,
  TerraformRoot,
} from './version/config'
