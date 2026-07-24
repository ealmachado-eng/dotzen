import {
  rule,
  AwsResource,
  AwsAttribute,
  AzureResource,
  AzureAttribute,
  GcpResource,
  GcpAttribute,
  Tag,
  Block,
  XrayMode,
  SqlTlsVersion,
  IngressSetting,
} from '../../../../../src/index'

export const spec = [
  // AWS Lambda
  rule()
    .resource(AwsResource.LambdaFunction)
    .mustEqual(AwsAttribute.TracingMode, XrayMode.Active)
    .message('Lambda functions must enable X-Ray active tracing'),

  rule()
    .resource(AwsResource.LambdaFunction)
    .mustBeSet(AwsAttribute.LambdaKmsKeyArn)
    .message('Lambda functions must encrypt env vars with a customer KMS key'),

  rule()
    .resource(AwsResource.LambdaFunction)
    .denyPlaintextEnvSecrets()
    .message('Lambda env vars must not contain plaintext secrets'),

  // Azure Functions
  rule()
    .resource(
      AzureResource.LinuxFunctionApp,
      AzureResource.WindowsFunctionApp,
      AzureResource.FunctionApp,
    )
    .mustBeTrue(AzureAttribute.HttpsOnly)
    .message('Azure Functions must enforce HTTPS-only'),

  rule()
    .resource(
      AzureResource.LinuxFunctionApp,
      AzureResource.WindowsFunctionApp,
      AzureResource.FunctionApp,
    )
    .mustEqual(AzureAttribute.SiteConfigMinTlsVersion, SqlTlsVersion.V12)
    .message('Azure Functions must require TLS 1.2'),

  rule()
    .resource(
      AzureResource.LinuxFunctionApp,
      AzureResource.WindowsFunctionApp,
      AzureResource.FunctionApp,
    )
    .denyWhenTrue(AzureAttribute.PublicNetworkAccessEnabled)
    .message('Azure Functions must not expose public network access'),

  rule()
    .resource(
      AzureResource.LinuxFunctionApp,
      AzureResource.WindowsFunctionApp,
      AzureResource.FunctionApp,
    )
    .mustHaveBlock(Block.Identity)
    .message('Azure Functions must use a managed identity (identity {} block)'),

  rule()
    .resource(
      AzureResource.LinuxFunctionApp,
      AzureResource.WindowsFunctionApp,
      AzureResource.FunctionApp,
    )
    .denyPlaintextEnvSecrets()
    .message('Azure Functions app_settings must not contain plaintext secrets'),

  rule()
    .resource(
      AzureResource.LinuxFunctionApp,
      AzureResource.WindowsFunctionApp,
      AzureResource.FunctionApp,
    )
    .mustHaveAssociated(
      AzureResource.MonitorDiagnosticSetting,
      AzureAttribute.TargetResourceId,
    )
    .message('Azure Functions must have diagnostic logging configured'),

  // GCP Cloud Run Functions
  rule()
    .resource(GcpResource.Cloudfunctions2Function)
    .denyValue(GcpAttribute.IngressSettings, IngressSetting.AllowAll)
    .message('Cloud Run Functions must not allow unrestricted ingress'),

  rule()
    .resource(GcpResource.Cloudfunctions2Function)
    .mustBeSet(GcpAttribute.ServiceAccountEmail)
    .message('Cloud Run Functions must set a runtime service account'),

  rule()
    .resource(GcpResource.Cloudfunctions2Function)
    .denyPlaintextEnvSecrets()
    .message('Cloud Run Functions env vars must not contain plaintext secrets'),

  // Shared: ownership tags on every serverless function type.
  rule()
    .resource(
      AwsResource.LambdaFunction,
      AzureResource.LinuxFunctionApp,
      AzureResource.WindowsFunctionApp,
      AzureResource.FunctionApp,
      GcpResource.Cloudfunctions2Function,
    )
    .mustHaveTags(Tag.Team, Tag.CostCenter, Tag.Environment)
    .message('Serverless functions must carry ownership tags'),
]
