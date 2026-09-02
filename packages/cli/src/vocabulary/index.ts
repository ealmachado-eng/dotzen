import { AzureResource, AzureAttribute } from './azure'
import { GcpResource, GcpAttribute } from './gcp'
import { DataResource, DataAttribute } from './data'
import { AwsResource, AwsAttribute } from './aws'

/**
 * Closed vocabulary for every domain value (doc 02). No bare strings.
 *
 * Cross-cloud enums (Port, Cidr, Effect, Tag, Protocol, Environment,
 * Approver, Provisioner, LifecycleAttribute, Wildcard, Block) are defined
 * here in `index.ts` — they're shared meaning across providers. Per-provider
 * vocabulary (AwsResource / AzureResource / GcpResource / DataResource and
 * their attribute companions) lives in sibling modules (`./aws`, `./azure`,
 * `./gcp`, `./data`) and is re-exported below so consumers import only
 * `../vocabulary`. The `AnyResource` / `AnyAttribute` unions at the bottom
 * are the engine's contract surface — adding a provider is one new sibling
 * module + one arm per union.
 *
 * NOTE: doc 02 specifies `const enum`. We use regular `enum` here because
 * `const enum` cannot be inlined across files by the esbuild/Vitest
 * transpiler under `isolatedModules`. Regular `enum` gives the identical
 * typo-safety (a misspelled member is a compile error); only cross-file
 * inlining differs, which is irrelevant here. See doc 02 note.
 */

// Nested block names/paths, for `mustHaveBlock` / `denyBlockPresence`.
export enum Block {
  EncryptionConfig = 'encryption_config',
  // A GCP instance access_config (nested in network_interface) = public IP.
  NetworkInterfaceAccessConfig = 'network_interface.access_config',
  // GCP subnetwork VPC flow logs / storage bucket access logging.
  LogConfig = 'log_config',
  Logging = 'logging',
  // AWS API Gateway stage access logging.
  AccessLogSettings = 'access_log_settings',
  // Azure managed-identity block (function app / web app). Present = the
  // resource uses a managed identity rather than a shared/local credential.
  Identity = 'identity',
  // AWS EKS node group `remote_access {}` block — direct SSH to nodes.
  // Presence means SSH is enabled; SSM Session Manager is preferred.
  RemoteAccess = 'remote_access',
  // GKE `workload_identity_config {}` block — enables Workload Identity
  // (pods authenticate as a KSA-mapped GSA instead of the node SA).
  WorkloadIdentityConfig = 'workload_identity_config',
}

/**
 * Terraform provisioner types (the `"x"` in `provisioner "x" {}`). These run
 * arbitrary commands on apply/destroy — a supply-chain / exfiltration surface
 * pluvian can govern with `denyProvisioner`. `local-exec` runs on the operator's
 * machine; `remote-exec` runs on the provisioned resource over SSH/WinRM.
 */
export enum Provisioner {
  LocalExec = 'local-exec',
  RemoteExec = 'remote-exec',
  /** `file` provisioner — copies files to the provisioned resource over the
   *  `connection` (SSH/WinRM). Less exfil-prone than local/remote-exec but
   *  still arbitrary I/O during apply; governable with `denyProvisioner`. */
  File = 'file',
}

/**
 * Resource `lifecycle {}` meta-attributes (flattened to `lifecycle.<key>` by
 * normalize — `lifecycle` is a nested block, NOT a meta-arg, so it IS
 * harvested). `prevent_destroy` blocks deletion (a safety control worth
 * requiring on stateful resources); `create_before_destroy` swaps the update
 * order to avoid outage. Target with the existing `mustBeTrue` /
 * `denyWhenTrue` conditions — no new condition needed.
 */
export enum LifecycleAttribute {
  PreventDestroy = 'lifecycle.prevent_destroy',
  CreateBeforeDestroy = 'lifecycle.create_before_destroy',
  /** `lifecycle { ignore_changes = [...] }` — harvested as a LIST attribute.
   *  Govern with `listContains(LifecycleAttribute.IgnoreChanges, 'tags', …)`
   *  to flag resources that hide drift on security-critical attributes. */
  IgnoreChanges = 'lifecycle.ignore_changes',
}

// Wildcard sentinel for list/value checks (e.g. an IAM/RBAC action of "*").
export enum Wildcard {
  All = '*',
}

// Multi-provider surface: the cloud-neutral engine (rules, conditions,
// normalized model) accepts any provider's resource/attribute vocabulary
// via these unions. Add a provider = add its module to the union here.
export {
  AzureResource,
  AzureAttribute,
  StorageTlsVersion,
  SqlTlsVersion,
  BuiltInRole,
  NetworkDefaultAction,
} from './azure'
export {
  GcpResource,
  GcpAttribute,
  PublicAccessPreventionMode,
  IamMember,
  PrimitiveRole,
  OauthScope,
  SqlSslMode,
  IngressSetting,
} from './gcp'
export { DataResource, DataAttribute } from './data'
export {
  AwsResource,
  AwsAttribute,
  TlsPolicy,
  EksLogType,
  HttpTokens,
  XrayMode,
  Acl,
  ApiGatewayAuthorization,
  MskClientBrokerEncryption,
} from './aws'
export type AnyResource =
  AwsResource | AzureResource | GcpResource | DataResource
export type AnyAttribute =
  | AwsAttribute
  | AzureAttribute
  | GcpAttribute
  | DataAttribute
  | LifecycleAttribute

export enum Port {
  SSH = 22,
  RDP = 3389,
  Postgres = 5432,
  MySQL = 3306,
}

export enum Cidr {
  Internet = '0.0.0.0/0',
  InternetV6 = '::/0',
}

export enum Effect {
  Block = 'block',
  Warn = 'warn',
  RequireApproval = 'require_approval',
}

export enum Tag {
  Team = 'team',
  CostCenter = 'cost_center',
  Environment = 'environment',
  DataClassification = 'data_classification',
}

// Listener protocols (for `denyValue` on plaintext). Cross-cloud — ALB/NLB
// (AWS), AzAPI/GCP load balancers all share the same wire strings.
export enum Protocol {
  Http = 'HTTP',
  Https = 'HTTPS',
  Tcp = 'TCP',
  Tls = 'TLS',
}

export enum Environment {
  Development = 'development',
  Staging = 'staging',
  Production = 'production',
}

// Org-defined approval groups/roles. Enum-backed like every other domain
// value so a typo'd approver is a compile error, not a misrouted approval.
export enum Approver {
  PlatformTeam = 'platform-team',
  SecurityArchitect = 'security-architect',
  FinOps = 'finops',
  SRE = 'sre',
}
