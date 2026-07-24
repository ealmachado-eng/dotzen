import { rule, AwsResource } from '../../../../../src/index'

enum OrgTag {
  ApmId = 'apm_id',
}

export const spec = [
  rule()
    .resource(AwsResource.DbInstance)
    .mustHaveTags(OrgTag.ApmId)
    .message('DB instances must carry apm_id'),
]