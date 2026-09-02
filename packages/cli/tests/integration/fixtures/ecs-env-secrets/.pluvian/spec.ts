import { rule, AwsResource } from '../../../../../src/index'

export const spec = [
  rule()
    .resource(AwsResource.EcsTaskDefinition)
    .denyPlaintextEnvSecrets()
    .message('ECS environment variables must not contain plaintext secrets')
    .rationale(
      'Use Secrets Manager / SSM Parameter Store references, not hardcoded values',
    ),
]
