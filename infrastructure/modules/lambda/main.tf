# ── Lambda Module ──────────────────────────────────────────────────────────────

variable "env" {
  description = "Environment name (dev | prod)"
  type        = string
}

variable "table_name" {
  description = "DynamoDB table name"
  type        = string
}

variable "table_arn" {
  description = "DynamoDB table ARN"
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 7
}

variable "provisioned_concurrency" {
  description = "Number of provisioned concurrency instances (0 = disabled)"
  type        = number
  default     = 0
}

variable "lambda_zip_path" {
  description = "Path to the built handler.zip file"
  type        = string
  default     = "../../lambda/dist/handler.zip"
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

# ── IAM Role ───────────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "seating-chart-lambda-${var.env}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json

  tags = {
    Environment = var.env
  }
}

# Basic Lambda execution (CloudWatch Logs)
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# DynamoDB permissions
data "aws_iam_policy_document" "dynamodb" {
  statement {
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
    ]
    resources = [
      var.table_arn,
      "${var.table_arn}/index/GSI1",
    ]
  }
}

resource "aws_iam_role_policy" "dynamodb" {
  name   = "dynamodb-access"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.dynamodb.json
}

# ── CloudWatch Log Group ───────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/seating-chart-projects-${var.env}"
  retention_in_days = var.log_retention_days

  tags = {
    Environment = var.env
  }
}

# ── Lambda Function ────────────────────────────────────────────────────────────

resource "aws_lambda_function" "main" {
  function_name = "seating-chart-projects-${var.env}"
  role          = aws_iam_role.lambda.arn
  handler       = "handler.handler"
  runtime       = "nodejs20.x"
  architectures = ["arm64"]
  memory_size   = 256
  timeout       = 10

  filename         = "${path.module}/${var.lambda_zip_path}"
  source_code_hash = filebase64sha256("${path.module}/${var.lambda_zip_path}")

  environment {
    variables = {
      TABLE_NAME = var.table_name
      ENV        = var.env
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.lambda,
    aws_iam_role_policy_attachment.lambda_basic,
  ]

  tags = {
    Environment = var.env
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

# ── Provisioned Concurrency (prod only) ───────────────────────────────────────

resource "aws_lambda_alias" "live" {
  name             = "live"
  function_name    = aws_lambda_function.main.function_name
  function_version = "$LATEST"
}

resource "aws_lambda_provisioned_concurrency_config" "main" {
  count = var.provisioned_concurrency > 0 ? 1 : 0

  function_name                  = aws_lambda_function.main.function_name
  qualifier                      = aws_lambda_alias.live.name
  provisioned_concurrent_executions = var.provisioned_concurrency
}

# ── Outputs ────────────────────────────────────────────────────────────────────

output "function_name" {
  value = aws_lambda_function.main.function_name
}

output "function_arn" {
  value = aws_lambda_function.main.arn
}

output "invoke_arn" {
  value = aws_lambda_function.main.invoke_arn
}
