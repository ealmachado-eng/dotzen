# Prompt: "a subnet for my GCP network"
# CIS GCP: VPC flow logs (a log_config block on the subnetwork).
resource "google_compute_subnetwork" "bad" {
  name          = "app-subnet"
  ip_cidr_range = "10.0.0.0/24"
  region        = "us-central1"
  network       = "default"
  # no log_config -> warn (VPC flow logs disabled)
}

resource "google_compute_subnetwork" "good" {
  name          = "app-subnet-2"
  ip_cidr_range = "10.0.1.0/24"
  region        = "us-central1"
  network       = "default"

  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}
