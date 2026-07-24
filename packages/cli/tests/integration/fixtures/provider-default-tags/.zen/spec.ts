import { rule, AwsResource, Port } from '../../../../../src/index'

enum OrgTag {
  ApmId = 'apm_id',
  CmdbAppId = 'cmdb_app_id',
}

export const spec = [
  // Both required tags are supplied by the root provider's default_tags, so
  // the tagless DB instances below (direct + nested-module) must PASS —
  // not flag a missing-tag violation. Before the provider-default_tags fix,
  // a tagless resource resolved to an empty tag set and this fired.
  rule()
    .resource(AwsResource.DbInstance)
    .mustHaveTags(OrgTag.ApmId, OrgTag.CmdbAppId)
    .message('DB instances must carry apm_id + cmdb_app_id'),
  // Control rule: a real violation must still fire, proving the provider
  // fix is not a blanket suppression.
  rule()
    .resource(AwsResource.SecurityGroup)
    .denyIngress(Port.SSH, Port.RDP)
    .message('SSH and RDP must not be open to the internet'),
]
