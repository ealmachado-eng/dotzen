# Prompt: "a GCP VM and a Cloud SQL instance for my app"
# AI grants the broad cloud-platform scope and pastes a literal DB password.
resource "google_compute_instance" "app" {
  name           = "app-vm"
  machine_type   = "e2-medium"
  zone           = "us-central1-a"
  can_ip_forward = true # -> violation
  # no shielded_instance_config -> warn (secure boot)

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
    }
  }

  network_interface {
    network = "default"
    access_config {} # ephemeral public IP -> warn (denyBlockPresence)
  }

  service_account {
    email  = "app@my-project.iam.gserviceaccount.com"
    scopes = ["cloud-platform"] # full API access -> warn
  }
}

variable "db_root_password" {
  type      = string
  sensitive = true
}

resource "google_sql_database_instance" "bad" {
  name             = "app-db"
  database_version = "POSTGRES_15"
  region           = "us-central1"
  root_password    = "S3cr3t-pw!" # hardcoded -> violation

  settings {
    tier = "db-f1-micro"
    ip_configuration {
      ipv4_enabled = true # public IP -> warn
    }
  }
}

resource "google_sql_database_instance" "good" {
  name             = "app-db-2"
  database_version = "POSTGRES_15"
  region           = "us-central1"
  root_password    = var.db_root_password # reference -> passes

  settings {
    tier = "db-f1-micro"
    ip_configuration {
      ipv4_enabled = false
      ssl_mode     = "ENCRYPTED_ONLY"
    }
  }
}
