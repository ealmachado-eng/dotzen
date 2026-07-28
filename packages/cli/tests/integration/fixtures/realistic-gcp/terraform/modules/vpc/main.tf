variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
}

resource "google_compute_network" "module_vpc" {
  name                    = "${var.environment}-module-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "module_subnet" {
  name          = "${var.environment}-module-subnet"
  network       = google_compute_network.module_vpc.id
  ip_cidr_range = "10.20.0.0/20"
  region        = "us-central1"
}
