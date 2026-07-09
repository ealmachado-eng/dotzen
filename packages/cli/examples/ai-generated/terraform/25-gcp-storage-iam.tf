# Prompt: "a GCS bucket for my app, make it easy to access"
# AI leaves public-access-prevention unset and grants allUsers.
resource "google_storage_bucket" "data" {
  name     = "app-data"
  location = "US"
  # public_access_prevention unset -> violation (must be "enforced")
  # uniform_bucket_level_access unset -> violation
}

resource "google_storage_bucket" "secure" {
  name                        = "app-secure"
  location                    = "US"
  public_access_prevention    = "enforced"
  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  logging {
    log_bucket = "app-access-logs"
  }
}

# Public bucket grant -> violation (the GCP public-exposure anti-pattern).
resource "google_storage_bucket_iam_member" "public" {
  bucket = google_storage_bucket.data.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# Scoped grant -> passes.
resource "google_storage_bucket_iam_member" "team" {
  bucket = google_storage_bucket.secure.name
  role   = "roles/storage.objectViewer"
  member = "group:web-team@example.com"
}

# Primitive owner role at project level -> violation.
resource "google_project_iam_member" "admin" {
  project = "my-project"
  role    = "roles/owner"
  member  = "user:dev@example.com"
}
