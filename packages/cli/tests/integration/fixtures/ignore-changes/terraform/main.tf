# VIOLATION: ignores drift on `tags` — governance over tags is silently
# bypassed. listContains(lifecycle.ignore_changes, "tags") flags it.
resource "aws_s3_bucket" "drifting" {
  bucket = "drifting"

  lifecycle {
    ignore_changes = [tags]
  }
}

# PASS: no lifecycle block (or ignore_changes on a non-flagged attr).
resource "aws_s3_bucket" "clean" {
  bucket = "clean"
}