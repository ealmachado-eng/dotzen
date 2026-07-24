# ── #10: variables ──────────────────────────────────────────────────────

# VIOLATION: secret-looking name, no `sensitive = true`.
variable "db_password" {
  default = "should-be-a-ref"
}

# PASS: secret-looking name + sensitive = true.
variable "api_key" {
  default   = "should-be-a-ref"
  sensitive = true
}

# PASS: not a secret-looking name (no sensitive needed).
variable "instance_count" {
  default = 2
}

# ── #12: locals ─────────────────────────────────────────────────────────

locals {
  # VIOLATION: secret-looking name + a plaintext literal.
  admin_password = "hunter2"

  # PASS: secret-looking name + a reference (the safe pattern).
  auth_token = var.token

  # PASS: not a secret-looking name (a literal is fine).
  common_tags = { team = "core" }
}