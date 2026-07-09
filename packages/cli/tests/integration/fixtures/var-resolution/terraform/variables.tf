# The variable lives in a separate file from the resource that uses it —
# resolution must work cross-file (parseTf builds scope across all files).
variable "admin_cidr" {
  type    = string
  default = "0.0.0.0/0"
}
