terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

locals {
  env        = "dev"
  domain     = var.domain_name
  api_domain = "api.${var.domain_name}"
}

# ── Cognito ────────────────────────────────────────────────────────────────────

module "cognito" {
  source             = "../../modules/cognito"
  env                = local.env
  app_domain         = local.domain
  local_callback_url = "http://localhost:5173/auth/callback"
}

# ── DynamoDB ───────────────────────────────────────────────────────────────────

module "dynamodb" {
  source      = "../../modules/dynamodb"
  env         = local.env
  enable_pitr = false
}

# ── Lambda ────────────────────────────────────────────────────────────────────

module "lambda" {
  source                  = "../../modules/lambda"
  env                     = local.env
  table_name              = module.dynamodb.table_name
  table_arn               = module.dynamodb.table_arn
  user_pool_arn           = module.cognito.user_pool_arn
  user_pool_id            = module.cognito.user_pool_id
  log_retention_days      = 7
  provisioned_concurrency = 0
}

# ── API Gateway ───────────────────────────────────────────────────────────────

module "api" {
  source               = "../../modules/api"
  env                  = local.env
  lambda_invoke_arn    = module.lambda.invoke_arn
  lambda_function_name = module.lambda.function_name
  user_pool_id         = module.cognito.user_pool_id
  user_pool_client_id  = module.cognito.client_id
}

# ── ACM Certificate ───────────────────────────────────────────────────────────
# Only creates the cert + DNS validation records. Alias records are below,
# after CloudFront and API GW are created, to avoid a circular dependency.

module "dns" {
  source         = "../../modules/dns"
  env            = local.env
  hosted_zone_id = var.hosted_zone_id
  domain_name    = local.domain
}

# ── API Gateway Custom Domain ─────────────────────────────────────────────────
# Defined inline (not in the api module) because it depends on the ACM cert.

resource "aws_apigatewayv2_domain_name" "api" {
  domain_name = local.api_domain

  domain_name_configuration {
    certificate_arn = module.dns.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
}

resource "aws_apigatewayv2_api_mapping" "api" {
  api_id      = module.api.api_id
  domain_name = aws_apigatewayv2_domain_name.api.id
  stage       = "$default"
}

# ── Frontend (S3 + CloudFront) ────────────────────────────────────────────────

module "frontend" {
  source              = "../../modules/frontend"
  env                 = local.env
  domain_name         = local.domain
  acm_certificate_arn = module.dns.certificate_arn
  enable_access_logs  = false
}

# ── Route 53 Alias Records ────────────────────────────────────────────────────
# Defined here (not in the dns module) so they can depend on CloudFront and
# API GW outputs without creating a cycle through the cert.

resource "aws_route53_record" "app_a" {
  zone_id = var.hosted_zone_id
  name    = local.domain
  type    = "A"

  alias {
    name                   = module.frontend.distribution_domain_name
    zone_id                = module.frontend.distribution_hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "app_aaaa" {
  zone_id = var.hosted_zone_id
  name    = local.domain
  type    = "AAAA"

  alias {
    name                   = module.frontend.distribution_domain_name
    zone_id                = module.frontend.distribution_hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "api_a" {
  zone_id = var.hosted_zone_id
  name    = local.api_domain
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "api_aaaa" {
  zone_id = var.hosted_zone_id
  name    = local.api_domain
  type    = "AAAA"

  alias {
    name                   = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}

# ── Outputs ────────────────────────────────────────────────────────────────────

output "cognito_user_pool_id" {
  value = module.cognito.user_pool_id
}

output "cognito_client_id" {
  value = module.cognito.client_id
}

output "cognito_hosted_ui_domain" {
  value = module.cognito.hosted_ui_domain
}

output "api_endpoint" {
  value = "https://${local.api_domain}"
}

output "frontend_bucket" {
  value = module.frontend.bucket_name
}

output "cloudfront_distribution_id" {
  value = module.frontend.distribution_id
}

output "dynamodb_table_name" {
  value = module.dynamodb.table_name
}

output "lambda_function_name" {
  value = module.lambda.function_name
}
