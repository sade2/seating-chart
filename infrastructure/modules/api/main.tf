# ── API Gateway HTTP API Module ────────────────────────────────────────────────

variable "env" {
  description = "Environment name (dev | prod)"
  type        = string
}

variable "lambda_invoke_arn" {
  description = "Lambda function invoke ARN"
  type        = string
}

variable "lambda_function_name" {
  description = "Lambda function name (for permission)"
  type        = string
}

variable "user_pool_id" {
  description = "Cognito User Pool ID"
  type        = string
}

variable "user_pool_client_id" {
  description = "Cognito App Client ID"
  type        = string
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

# ── HTTP API ───────────────────────────────────────────────────────────────────

resource "aws_apigatewayv2_api" "main" {
  name          = "seating-chart-api-${var.env}"
  protocol_type = "HTTP"

  cors_configuration {
    allow_headers  = ["Content-Type", "Authorization"]
    allow_methods  = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_origins  = ["*"]
    expose_headers = []
    max_age        = 300
  }

  tags = {
    Environment = var.env
  }
}

# ── JWT Authorizer ─────────────────────────────────────────────────────────────

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.main.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "cognito-jwt"

  jwt_configuration {
    audience = [var.user_pool_client_id]
    issuer   = "https://cognito-idp.${data.aws_region.current.name}.amazonaws.com/${var.user_pool_id}"
  }
}

# ── Lambda Integration ─────────────────────────────────────────────────────────

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.lambda_invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 10000
}

# ── Routes ─────────────────────────────────────────────────────────────────────

locals {
  protected_routes = [
    "GET /v1/projects",
    "POST /v1/projects",
    "GET /v1/projects/{id}",
    "PUT /v1/projects/{id}",
    "PATCH /v1/projects/{id}",
    "DELETE /v1/projects/{id}",
    "GET /v1/projects/{id}/shares",
    "POST /v1/projects/{id}/shares",
    "DELETE /v1/projects/{id}/shares/{email}",
  ]
}

resource "aws_apigatewayv2_route" "protected" {
  for_each = toset(local.protected_routes)

  api_id             = aws_apigatewayv2_api.main.id
  route_key          = each.value
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "health" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /v1/health"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  # No auth required
}

# ── Stage ──────────────────────────────────────────────────────────────────────

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      responseLength = "$context.responseLength"
      errorMessage   = "$context.error.message"
    })
  }

  tags = {
    Environment = var.env
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/apigateway/seating-chart-${var.env}"
  retention_in_days = 7
}

# ── Lambda Permission ──────────────────────────────────────────────────────────

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

# ── Outputs ────────────────────────────────────────────────────────────────────

output "api_id" {
  value = aws_apigatewayv2_api.main.id
}

output "api_endpoint" {
  value       = aws_apigatewayv2_stage.default.invoke_url
  description = "Default invoke URL (before custom domain)"
}
