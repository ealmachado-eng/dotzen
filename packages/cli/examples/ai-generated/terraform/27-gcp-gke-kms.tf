# Prompt: "a GKE cluster and a KMS key for my app"
# AI leaves legacy ABAC on, nodes public, no network policy, no key rotation.
resource "google_container_cluster" "bad" {
  name               = "app-gke"
  location           = "us-central1"
  initial_node_count = 1
  enable_legacy_abac = true # legacy authz -> violation
  # private_cluster_config absent -> warn (private nodes)
  # network_policy absent -> warn
}

resource "google_container_cluster" "good" {
  name               = "app-gke-2"
  location           = "us-central1"
  initial_node_count = 1
  enable_legacy_abac = false

  private_cluster_config {
    enable_private_nodes = true
  }

  network_policy {
    enabled = true
  }
}

resource "google_kms_crypto_key" "bad" {
  name     = "app-key"
  key_ring = "projects/my-project/locations/us/keyRings/app"
  # rotation_period unset -> violation
}

resource "google_kms_crypto_key" "good" {
  name            = "app-key-2"
  key_ring        = "projects/my-project/locations/us/keyRings/app"
  rotation_period = "7776000s" # 90 days
}
