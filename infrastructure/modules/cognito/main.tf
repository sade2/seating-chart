# ── Cognito Module ─────────────────────────────────────────────────────────────

variable "env" {
  description = "Environment name (dev | prod)"
  type        = string
}

variable "app_domain" {
  description = "Primary app domain, e.g. yourdomain.com or dev.yourdomain.com"
  type        = string
}

variable "local_callback_url" {
  description = "Localhost callback URL for development (e.g. http://localhost:5173/auth/callback)"
  type        = string
  default     = ""
}

# ── User Pool ──────────────────────────────────────────────────────────────────

resource "aws_cognito_user_pool" "main" {
  name = "seating-chart-${var.env}"

  # Sign in with email
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  username_configuration {
    case_sensitive = false
  }

  # Password policy
  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  # Email verification
  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Your Seating Chart verification code"
    email_message        = "Your verification code is {####}"
  }

  # Account recovery
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # No MFA for v1
  mfa_configuration = "OFF"

  tags = {
    Environment = var.env
  }
}

# ── App Client ─────────────────────────────────────────────────────────────────

locals {
  callback_urls = compact([
    "https://${var.app_domain}/auth/callback",
    var.local_callback_url,
  ])
  logout_urls = compact([
    "https://${var.app_domain}",
    var.local_callback_url != "" ? "http://localhost:5173" : "",
  ])
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "seating-chart-web"
  user_pool_id = aws_cognito_user_pool.main.id

  # No client secret — SPA cannot keep secrets
  generate_secret = false

  # Auth flows
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  # OAuth
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  supported_identity_providers         = ["COGNITO"]
  callback_urls                        = local.callback_urls
  logout_urls                          = local.logout_urls

  # Token validity
  access_token_validity  = 60   # minutes
  id_token_validity      = 60   # minutes
  refresh_token_validity = 30   # days

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  prevent_user_existence_errors = "ENABLED"
}

# ── Hosted UI Domain ───────────────────────────────────────────────────────────

resource "aws_cognito_user_pool_domain" "main" {
  domain       = "auth-seating-chart-${var.env}"
  user_pool_id = aws_cognito_user_pool.main.id
}

# ── Outputs ────────────────────────────────────────────────────────────────────

output "user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "user_pool_arn" {
  value = aws_cognito_user_pool.main.arn
}

output "client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "hosted_ui_domain" {
  value = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${data.aws_region.current.name}.amazoncognito.com"
}

output "jwks_uri" {
  value = "https://cognito-idp.${data.aws_region.current.name}.amazonaws.com/${aws_cognito_user_pool.main.id}/.well-known/jwks.json"
}

data "aws_region" "current" {}
