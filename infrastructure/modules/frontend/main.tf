# ── Frontend Hosting Module (S3 + CloudFront) ──────────────────────────────────

variable "env" {
  description = "Environment name (dev | prod)"
  type        = string
}

variable "domain_name" {
  description = "Primary domain for the app (e.g. yourdomain.com or dev.yourdomain.com)"
  type        = string
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN in us-east-1 (required for CloudFront)"
  type        = string
}

variable "enable_access_logs" {
  description = "Enable CloudFront access logging (prod only)"
  type        = bool
  default     = false
}

data "aws_caller_identity" "current" {}

# ── S3 Bucket (private) ───────────────────────────────────────────────────────

resource "aws_s3_bucket" "frontend" {
  bucket = "seating-chart-frontend-${var.env}-${data.aws_caller_identity.current.account_id}"

  tags = {
    Environment = var.env
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  versioning_configuration {
    status = "Enabled"
  }
}

# ── CloudFront OAC ────────────────────────────────────────────────────────────

resource "aws_cloudfront_origin_access_control" "main" {
  name                              = "seating-chart-frontend-${var.env}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ── S3 Bucket Policy (allow CloudFront OAC) ───────────────────────────────────

data "aws_iam_policy_document" "s3_cloudfront" {
  statement {
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.main.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.s3_cloudfront.json
}

# ── Access Logs Bucket (prod only) ────────────────────────────────────────────

resource "aws_s3_bucket" "logs" {
  count  = var.enable_access_logs ? 1 : 0
  bucket = "seating-chart-cf-logs-${var.env}-${data.aws_caller_identity.current.account_id}"

  tags = {
    Environment = var.env
  }
}

resource "aws_s3_bucket_ownership_controls" "logs" {
  count  = var.enable_access_logs ? 1 : 0
  bucket = aws_s3_bucket.logs[0].id

  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

# ── CloudFront Distribution ───────────────────────────────────────────────────

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  aliases             = [var.domain_name]
  price_class         = "PriceClass_100"
  comment             = "seating-chart-${var.env}"

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "s3-frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.main.id
  }

  # /assets/* — long-lived, Vite content-hashes everything
  ordered_cache_behavior {
    path_pattern           = "/assets/*"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-frontend"
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    min_ttl     = 31536000
    default_ttl = 31536000
    max_ttl     = 31536000
    compress    = true
  }

  # Default — index.html, always revalidate
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-frontend"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0

    # Security headers
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
  }

  # SPA routing: 403 and 404 from S3 → serve index.html
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  dynamic "logging_config" {
    for_each = var.enable_access_logs ? [1] : []
    content {
      include_cookies = false
      bucket          = aws_s3_bucket.logs[0].bucket_regional_domain_name
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = var.acm_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = {
    Environment = var.env
  }
}

# ── Security Headers ──────────────────────────────────────────────────────────

resource "aws_cloudfront_response_headers_policy" "security" {
  name = "seating-chart-security-headers-${var.env}"

  security_headers_config {
    strict_transport_security {
      override                   = true
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = true
    }

    frame_options {
      override     = true
      frame_option = "DENY"
    }

    content_type_options {
      override = true
    }

    referrer_policy {
      override        = true
      referrer_policy = "strict-origin-when-cross-origin"
    }
  }
}

# ── Outputs ────────────────────────────────────────────────────────────────────

output "bucket_name" {
  value = aws_s3_bucket.frontend.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.frontend.arn
}

output "distribution_id" {
  value = aws_cloudfront_distribution.main.id
}

output "distribution_domain_name" {
  value = aws_cloudfront_distribution.main.domain_name
}

output "distribution_hosted_zone_id" {
  value = aws_cloudfront_distribution.main.hosted_zone_id
}
