/** Public DSL surface — what `.zen/spec.ts` imports. */
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
//   import { cisAws } from '@dotzen/dotzen'
//   export const spec = [...cisAws, /* your rules *\/]
export { cisAws } from './presets/cis-aws'
export { cisAzure } from './presets/cis-azure'
export { cisGcp } from './presets/cis-gcp'
