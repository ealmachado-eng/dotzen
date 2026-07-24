import { rule, AwsResource, Provisioner } from '../../../../../src/index'

export const spec = [
  // Provisioners run arbitrary commands on apply/destroy — a supply-chain /
  // exfiltration surface. Both local-exec and remote-exec are forbidden here.
  rule()
    .resource(AwsResource.Instance)
    .denyProvisioner(Provisioner.LocalExec, Provisioner.RemoteExec)
    .message('provisioners are forbidden — use user_data / a config manager'),
]
