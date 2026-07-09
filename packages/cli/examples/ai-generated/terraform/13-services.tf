# Prompt: "an ECS service, an EKS cluster, and a load balancer for my app"
# AI leaves public exposure and logging at their insecure defaults.

resource "aws_ecs_service" "app" {
  name = "app"

  network_configuration {
    subnets          = ["subnet-1", "subnet-2"]
    assign_public_ip = true
  }
}

resource "aws_eks_cluster" "app" {
  name     = "app-cluster"
  role_arn = "arn:aws:iam::123456789012:role/eks"

  vpc_config {
    subnet_ids             = ["subnet-1", "subnet-2"]
    endpoint_public_access = true
    public_access_cidrs    = ["0.0.0.0/0"] # open to the whole internet
  }
  # enabled_cluster_log_types omitted -> no control-plane audit logging
  # encryption_config omitted -> Kubernetes secrets not envelope-encrypted
}

resource "aws_lb" "web" {
  name               = "web-alb"
  load_balancer_type = "application"
  # access_logs omitted -> disabled; drop_invalid_header_fields omitted -> false
}
