terraform {
  required_version = "= 1.7.5"

  # VIOLATION: an explicit `local` backend — unencrypted, unshared, unlocked.
  # Both requireEncryptedBackend (no encrypt) and denyLocalBackend fire.
  backend "local" {
    path = "terraform.tfstate"
  }
}