# ── Variables ────────────────────────────────────────────────────────────

variable "environment" {
  description = "Deployment environment (dev, stg, prd)"
  type        = string
  default     = "dev"
}

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "db_password" {
  description = "Cloud SQL admin password"
  type        = string
  sensitive   = true
}

variable "labels" {
  description = "Additional labels merged into common_labels"
  type        = map(string)
  default     = {}
}

variable "enable_monitoring" {
  description = "Enable Cloud Monitoring"
  type        = bool
  default     = true
}

variable "db_tier" {
  description = "Cloud SQL machine tier"
  type        = string
  default     = "db-f1-micro"
}

variable "sql_availability" {
  description = "Cloud SQL availability type"
  type        = string
  default     = "ZONAL"
}

variable "legacy_abac" {
  description = "Enable legacy ABAC (should be false in production)"
  type        = bool
}

# ── Locals ───────────────────────────────────────────────────────────────

locals {
  is_production = var.environment == "prd"

  common_labels = merge(var.labels, {
    team        = "platform"
    cost_center = "cc-1001"
    environment = var.environment
  })
}

# ── VPC ──────────────────────────────────────────────────────────────────

resource "google_compute_network" "main" {
  name                    = "${var.environment}-vpc"
  auto_create_subnetworks = false
  labels                  = local.common_labels
}

resource "google_compute_subnetwork" "main" {
  name          = "${var.environment}-subnet"
  network       = google_compute_network.main.id
  ip_cidr_range = "10.10.0.0/20"
  region        = var.region
  labels        = local.common_labels
}

# ── Firewall (VIOLATION: SSH open to 0.0.0.0/0) ──────────────────────────

resource "google_compute_firewall" "ssh" {
  name    = "${var.environment}-allow-ssh"
  network = google_compute_network.main.id

  direction = "INGRESS"

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = ["0.0.0.0/0"]
}

# ── Storage ──────────────────────────────────────────────────────────────

resource "google_storage_bucket" "data" {
  name                        = "${var.environment}-data-bucket"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention   = "enforced"
  force_destroy               = true

  versioning {
    enabled = true
  }

  labels = local.common_labels
}

# VIOLATION: allUsers granted objectViewer on the bucket
resource "google_storage_bucket_iam_member" "public" {
  bucket = google_storage_bucket.data.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# ── Cloud SQL ────────────────────────────────────────────────────────────

resource "google_sql_database_instance" "main" {
  name             = "${var.environment}-db"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier             = var.db_tier
    availability_type = var.sql_availability

    ip_configuration {
      ipv4_enabled = false
      ssl_mode     = "ENCRYPTED_ONLY"
    }
  }

  labels = local.common_labels
}

resource "google_sql_user" "admin" {
  name     = "admin"
  instance = google_sql_database_instance.main.name
  password = var.db_password
}

# ── GKE ──────────────────────────────────────────────────────────────────

resource "google_container_cluster" "main" {
  name     = "${var.environment}-gke"
  location = var.region
  network  = google_compute_network.main.id
  subnetwork = google_compute_subnetwork.main.id

  enable_legacy_abac = local.is_production ? false : var.legacy_abac

  private_cluster_config {
    enable_private_nodes = true
  }

  network_policy {
    enabled = true
  }

  remove_default_node_pool = true
  initial_node_count       = 1

  labels = local.common_labels
}

resource "google_container_node_pool" "main" {
  name       = "main-pool"
  cluster    = google_container_cluster.main.name
  node_count = 1

  node_config {
    machine_type = "e2-medium"
  }
}

# ── KMS ───────────────────────────────────────────────────────────────────

resource "google_kms_key_ring" "main" {
  name     = "${var.environment}-keyring"
  location = var.region
}

resource "google_kms_crypto_key" "main" {
  name            = "${var.environment}-crypto-key"
  key_ring        = google_kms_key_ring.main.id
  rotation_period = "7776000s"
  labels          = local.common_labels
}

# ── Service Account ──────────────────────────────────────────────────────

resource "google_service_account" "app" {
  account_id   = "${var.environment}-app-sa"
  display_name = "Application service account"
  labels       = local.common_labels
}

# ── Compute Instance (VIOLATION: public IP via access_config) ────────────

resource "google_compute_instance" "bastion" {
  name         = "${var.environment}-bastion"
  machine_type = "e2-medium"
  zone         = "us-central1-a"
  can_ip_forward = false

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-11"
    }
  }

  network_interface {
    network    = google_compute_network.main.id
    subnetwork = google_compute_subnetwork.main.id
    access_config {}
  }

  shielded_instance_config {
    enable_secure_boot = true
  }

  labels = local.common_labels
}

# ── Cloud Run ─────────────────────────────────────────────────────────────

resource "google_cloud_run_service" "api" {
  name     = "${var.environment}-api"
  location = var.region

  template {
    spec {
      containers {
        image = "gcr.io/${var.project_id}/api:latest"
      }
    }
  }

  labels = local.common_labels
}

# ── Pub/Sub ───────────────────────────────────────────────────────────────

resource "google_pubsub_topic" "events" {
  name   = "${var.environment}-events"
  labels = local.common_labels
}

resource "google_pubsub_subscription" "events" {
  name  = "${var.environment}-events-sub"
  topic = google_pubsub_topic.events.id
  labels = local.common_labels
}

# ── Logging ───────────────────────────────────────────────────────────────

resource "google_logging_project_sink" "audit" {
  name        = "${var.environment}-audit-sink"
  destination = "storage.googleapis.com/${google_storage_bucket.data.name}"
  filter      = "logName:\"cloudaudit.googleapis.com\""
  labels      = local.common_labels
}

# ── Utility (silently skipped by UTILITY_TYPES) ─────────────────────────

resource "random_id" "db_suffix" {
  byte_length = 4
}

# ── Ungoverned resource (NOT in GcpResource enum) ──────────────────────

resource "google_workflows_workflow" "processor" {
  name        = "${var.environment}-processor"
  region      = var.region
  labels      = local.common_labels
}

# ── Local module call (exercises module-following) ──────────────────────

module "vpc" {
  source      = "./modules/vpc"
  project_id  = var.project_id
  environment = var.environment
}
