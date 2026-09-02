# =============================================================================
# AI-generated Terraform: "web application on GCP"
# Deliberately includes COMMON AI failure patterns for pluvian fixture testing.
# No terraform {} block (no state encryption).
# =============================================================================

variable "project_id" {
  description = "GCP project ID"
  type        = string
  default     = "my-ai-app-project"
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
}

# ── VPC ──────────────────────────────────────────────────────────────────────

resource "google_compute_network" "main" {
  name                    = "ai-app-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "main" {
  name          = "ai-app-subnet"
  network       = google_compute_network.main.id
  ip_cidr_range = "10.20.0.0/20"
  region        = var.region
}

# ── Firewall (MISTAKE 1: SSH open to 0.0.0.0/0) ─────────────────────────────

resource "google_compute_firewall" "allow_ssh" {
  name    = "ai-app-allow-ssh"
  network = google_compute_network.main.id

  direction = "INGRESS"

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = ["0.0.0.0/0"]
}

resource "google_compute_firewall" "allow_http" {
  name    = "ai-app-allow-http"
  network = google_compute_network.main.id

  direction = "INGRESS"

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }

  source_ranges = ["0.0.0.0/0"]
}

# ── GCS bucket (MISTAKES 2,3,4: no public_access_prevention, no UBLA,
#    no versioning; also inconsistent labels) ────────────────────────────────

resource "google_storage_bucket" "uploads" {
  name     = "ai-app-uploads-bucket"
  location = var.region

  labels = {
    Team        = "web"
    cost_center = "cc-2002"
    Environment = "production"
  }
}

# ── Public IAM member (MISTAKE 5: allUsers) ─────────────────────────────────

resource "google_storage_bucket_iam_member" "public_reader" {
  bucket = google_storage_bucket.uploads.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# ── Cloud SQL (MISTAKES 6,7,8: public IP, no SSL, hardcoded password) ───────

resource "google_sql_database_instance" "primary" {
  name             = "ai-app-db"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier = "db-f1-micro"

    ip_configuration {
      ipv4_enabled = true
      # ssl_mode absent — defaults to ALLOW_UNENCRYPTED_AND_ENCRYPTED
    }

    user_labels = {
      team        = "web"
      cost_center = "cc-2002"
      environment = "production"
    }
  }
}

resource "google_sql_user" "admin" {
  name     = "admin"
  instance = google_sql_database_instance.primary.name
  password = "RootPassword123!"   # MISTAKE 8: hardcoded literal
}

# ── GKE (MISTAKES 9,10,11: not private, legacy ABAC, no Workload Identity) ──

resource "google_container_cluster" "main" {
  name     = "ai-app-gke"
  location = var.region
  network  = google_compute_network.main.id
  subnetwork = google_compute_subnetwork.main.id

  enable_legacy_abac = true   # MISTAKE 10

  # private_cluster_config absent — MISTAKE 9 (enable_private_nodes not true)
  # workload_identity_config absent — MISTAKE 11

  remove_default_node_pool = true
  initial_node_count       = 1

  resource_labels = {
    team        = "platform"
    cost_center = "cc-2002"
    environment = "production"
  }
}

# ── Compute instance (MISTAKE 12: public IP via access_config) ──────────────

resource "google_compute_instance" "bastion" {
  name         = "ai-app-bastion"
  machine_type = "e2-medium"
  zone         = "us-central1-a"

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-11"
    }
  }

  network_interface {
    network    = google_compute_network.main.id
    subnetwork = google_compute_subnetwork.main.id
    access_config {}   # MISTAKE 12: public IP
  }

  labels = {
    team        = "platform"
    cost_center = "cc-2002"
    environment = "production"
  }
}

# ── KMS (MISTAKE 13: no rotation_period) ────────────────────────────────────

resource "google_kms_key_ring" "main" {
  name     = "ai-app-keyring"
  location = var.region
}

resource "google_kms_crypto_key" "main" {
  name     = "ai-app-crypto-key"
  key_ring = google_kms_key_ring.main.id
  # rotation_period absent — MISTAKE 13
}

# ── Service account (fine, but unlabeled — inconsistent labels) ─────────────

resource "google_service_account" "app" {
  account_id   = "ai-app-sa"
  display_name = "Application service account"
}

# ── Utility types (silently skipped by UTILITY_TYPES) ───────────────────────

resource "null_resource" "provisioner_step" {
  triggers = {
    cluster_name = google_container_cluster.main.name
  }
}

resource "random_id" "suffix" {
  byte_length = 4
}

# ── Ungoverned type (Kubernetes provider, NOT GCP) ──────────────────────────

resource "kubernetes_config_map" "app_config" {
  metadata {
    name = "app-config"
  }

  data = {
    DATABASE_URL = "postgresql://localhost:5432/app"
  }
}
