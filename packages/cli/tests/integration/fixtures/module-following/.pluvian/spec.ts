import { rule, AwsResource, Port } from '../../../../../src/index'

enum OrgTag {
  ApmId = 'apm_id',
  CmdbAppId = 'cmdb_app_id',
}

export const spec = [
  rule()
    .resource(AwsResource.DbInstance)
    .mustHaveTags(OrgTag.ApmId, OrgTag.CmdbAppId)
    .message('DB instances must carry apm_id + cmdb_app_id'),
  rule()
    .resource(AwsResource.SecurityGroup)
    .denyIngress(Port.Postgres)
    .message('DB port must not be open to the internet'),
]
