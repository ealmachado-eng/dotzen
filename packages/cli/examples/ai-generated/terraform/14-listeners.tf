# Prompt: "an HTTPS listener and an HTTP listener for my ALB"
# AI often pins an outdated TLS policy and serves plaintext HTTP directly.

resource "aws_lb_listener" "https" {
  load_balancer_arn = "arn:aws:elasticloadbalancing:::listener/app"
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS-1-0-2015-04" # allows TLS 1.0

  default_action {
    type = "forward"
  }
}

resource "aws_lb_listener" "plain" {
  load_balancer_arn = "arn:aws:elasticloadbalancing:::listener/app"
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "forward" # serves plaintext (not a redirect) -> flagged
  }
}

# HTTP that only redirects to HTTPS — the correct pattern, must NOT be flagged.
resource "aws_lb_listener" "redirect" {
  load_balancer_arn = "arn:aws:elasticloadbalancing:::listener/app"
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
  }
}
