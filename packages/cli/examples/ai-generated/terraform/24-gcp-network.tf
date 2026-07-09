# Prompt: "a GCP firewall so I can reach my VM"
# AI commonly opens SSH/RDP to 0.0.0.0/0.
resource "google_compute_firewall" "ssh" {
  name    = "allow-ssh"
  network = "default"
  # direction defaults to INGRESS

  allow {
    protocol = "tcp"
    ports    = ["22", "3389"]
  }

  source_ranges = ["0.0.0.0/0"] # whole internet -> violation
}

# Internal-only firewall -> passes.
resource "google_compute_firewall" "internal" {
  name    = "allow-internal-https"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }

  source_ranges = ["10.0.0.0/8"]
}
