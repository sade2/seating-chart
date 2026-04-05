# ── DNS Module (ACM Certificate + Route 53 validation) ────────────────────────
# This module only creates the ACM cert and its DNS validation records.
# Route 53 alias records (app → CloudFront, api → API Gateway) are defined
# inline in the environment's main.tf to avoid a circular dependency:
#   cert needs hosted_zone_id only (no CloudFront/API GW)
#   CloudFront needs the cert ARN
#   API GW custom domain needs the cert ARN
#   Route 53 alias records need CloudFront + API GW outputs

variable "env" {
  description = "Environment name"
  type        = string
}

variable "hosted_zone_id" {
  description = "Route 53 hosted zone ID for the domain"
  type        = string
}

variable "domain_name" {
  description = "Primary app domain (e.g. seating-chart.myurl.com)"
  type        = string
}

# ── ACM Certificate (must be in us-east-1 for CloudFront) ─────────────────────

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

resource "aws_acm_certificate" "main" {
  provider = aws.us_east_1

  domain_name               = var.domain_name
  subject_alternative_names = ["*.${var.domain_name}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Environment = var.env
  }
}

# DNS validation records
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id         = var.hosted_zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.record]
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "main" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

# ── Outputs ────────────────────────────────────────────────────────────────────

output "certificate_arn" {
  value       = aws_acm_certificate_validation.main.certificate_arn
  description = "Validated ACM certificate ARN (us-east-1) for CloudFront"
}
