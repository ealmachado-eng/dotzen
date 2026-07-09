variable "ssh_cidr" {
  type    = string
  default = "0.0.0.0/0" # prd: SAME var name, different (open) default
}
