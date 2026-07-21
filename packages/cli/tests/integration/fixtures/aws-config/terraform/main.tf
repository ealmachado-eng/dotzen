# A compliant Config recorder — records all resource types including global.
# CIS AWS §3.1/3.2.
resource "aws_config_configuration_recorder" "good" {
  name     = "good-recorder"
  role_arn = "arn:aws:iam::123456789012:role/config"

  recording_group {
    all_supported                  = true
    include_global_resource_types = true
  }
}

# A non-compliant Config recorder — does not record all resource types.
resource "aws_config_configuration_recorder" "bad" {
  name     = "bad-recorder"
  role_arn = "arn:aws:iam::123456789012:role/config"

  recording_group {
    all_supported                  = false
    include_global_resource_types = false
  }
}
