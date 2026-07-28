# ── VIOLATIONS (CIS GCP preset must flag these) ────────────────────────

# Storage: no public access prevention, no UBLA, no versioning
resource "google_storage_bucket" "bad_bucket" {
  name          = "bad-bucket"
  location      = "US"
  force_destroy = true
  public_access_prevention = "inherited"
  uniform_bucket_level_access = false
}

# Cloud SQL: public IPv4, no SSL, hardcoded root password
resource "google_sql_database_instance" "bad_sql" {
  name             = "bad-sql"
  database_version = "POSTGRES_14"
  region           = "us-central1"

  settings {
    ip_configuration {
      ipv4_enabled = true
      ssl_mode     = "ALLOW_UNENCRYPTED_AND_ENCRYPTED"
    }
    tier = "db-f1-micro"
  }

  root_password = "hunter2"
}

# GKE: no private nodes, legacy ABAC enabled
resource "google_container_cluster" "bad_gke" {
  name               = "bad-gke"
  location           = "us-central1-a"
  enable_legacy_abac = true

  private_cluster_config {
    enable_private_nodes = false
  }

  node_config {
    machine_type = "e2-medium"
  }
}

# KMS: no rotation period set
resource "google_kms_crypto_key" "bad_key" {
  name     = "bad-key"
  key_ring = "kr"
}

# Compute: no secure boot, IP forwarding enabled
resource "google_compute_instance" "bad_vm" {
  name         = "bad-vm"
  machine_type = "e2-medium"
  zone         = "us-central1-a"
  can_ip_forward = true

  shielded_instance_config {
    enable_secure_boot = false
  }

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-11"
    }
  }

  network_interface {
    network = "default"
  }
}

# IAM: allUsers on a bucket
resource "google_storage_bucket_iam_member" "bad_iam" {
  bucket = "bad-bucket"
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# Cloud Run Functions: unrestricted ingress
resource "google_cloudfunctions2_function" "bad_fn" {
  name     = "bad-fn"
  location = "us-central1"

  service_config {
    ingress_settings = "ALLOW_ALL"
  }
}

# ── COMPLIANT (preset must NOT flag these) ──────────────────────────────

resource "google_storage_bucket" "good_bucket" {
  name          = "good-bucket"
  location      = "US"
  force_destroy = true
  public_access_prevention = "enforced"
  uniform_bucket_level_access = true
  versioning {
    enabled = true
  }
}

resource "google_sql_database_instance" "good_sql" {
  name             = "good-sql"
  database_version = "POSTGRES_14"
  region           = "us-central1"

  settings {
    ip_configuration {
      ipv4_enabled = false
      ssl_mode     = "ENCRYPTED_ONLY"
    }
    tier = "db-f1-micro"
  }
}

resource "google_container_cluster" "good_gke" {
  name               = "good-gke"
  location           = "us-central1-a"
  enable_legacy_abac = false

  private_cluster_config {
    enable_private_nodes = true
  }

  workload_identity_config {
    workload_pool = "my-project.svc.id.goog"
  }

  node_config {
    machine_type = "e2-medium"
  }
}

resource "google_kms_crypto_key" "good_key" {
  name            = "good-key"
  key_ring        = "kr"
  rotation_period = "7776000s"
}

# ── Additional violations: firewall + binding-surface ───────────────────

# Firewall: SSH open to the internet (CIS GCP §4.6)
resource "google_compute_firewall" "bad_fw" {
  name    = "bad-fw"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = ["0.0.0.0/0"]
  direction      = "INGRESS"
}

# A secret-looking variable WITHOUT sensitive = true (binding-surface rule)
variable "db_password" {
  default = "hunter2"
}

# A local with a hardcoded secret (binding-surface rule)
locals {
  api_token = "ghp_xxxxxxxxxxxx"
}

# ── Additional compliant: firewall restricted + sensitive variable ──────

resource "google_compute_firewall" "good_fw" {
  name    = "good-fw"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = ["10.0.0.0/8"]
  direction      = "INGRESS"
}

variable "safe_secret" {
  default   = "ref-to-secret"
  sensitive = true
}
