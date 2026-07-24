terraform {
  # VIOLATION: a bare version is `>= 1.7.5` (floating), not an exact pin.
  required_version = "1.7.5"

  required_providers {
    # PASS: exact pin.
    aws = {
      source  = "hashicorp/aws"
      version = "= 5.3.1"
    }
    # VIOLATION: floating `>=` constraint.
    google = {
      source  = "hashicorp/google"
      version = ">= 4.0"
    }
  }
}