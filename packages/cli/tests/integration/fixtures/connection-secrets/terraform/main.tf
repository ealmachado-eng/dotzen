# VIOLATION: a plaintext private_key + password in the connection block —
# the key material leaks in source control.
resource "aws_instance" "bad" {
  ami           = "ami-1"
  instance_type = "t3.micro"

  connection {
    type        = "ssh"
    host        = self.public_ip
    private_key = "-----BEGIN RSA PRIVATE KEY-----\nMII...\n-----END RSA PRIVATE KEY-----"
    password    = "hunter2"
  }

  provisioner "remote-exec" {
    inline = ["whoami"]
  }
}

# PASS: the connection block references a var (no hardcoded secret).
resource "aws_instance" "good" {
  ami           = "ami-2"
  instance_type = "t3.micro"

  connection {
    type        = "ssh"
    host        = self.public_ip
    private_key = var.ssh_key
  }

  provisioner "remote-exec" {
    inline = ["whoami"]
  }
}