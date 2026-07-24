# No `provider` arg → uses the child's default aws provider, which the caller
# remapped to aws.dr via the `providers` map. So this instance IS dr-aliased,
# and the dr-scoped encryption rule fires on its unencrypted root volume.
resource "aws_instance" "child" {
  ami           = "ami-1"
  instance_type = "t3.micro"

  root_block_device {
    encrypted = false
  }
}