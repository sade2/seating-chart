# ── Bootstrap — run once manually with local state ─────────────────────────────
# Creates: S3 state bucket, DynamoDB lock table, GitHub OIDC IAM roles
#
# Usage:
#   cd infrastructure/bootstrap
#   terraform init
#   terraform apply -var="github_org=YOUR_ORG" -var="github_repo=seating-chart" -var="aws_account_id=123456789012"
#
# After apply, copy the output values into environments/dev/backend.tf and
# environments/prod/backend.tf.

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

variable "github_org" {
  description = "GitHub organization or username (e.g. acme-corp)"
  type        = string
}

variable "github_repo" {
  description = "GitHub repository name (e.g. seating-chart)"
  type        = string
}

variable "aws_account_id" {
  description = "AWS account ID"
  type        = string
}

# ── S3 state bucket ────────────────────────────────────────────────────────────

resource "aws_s3_bucket" "tfstate" {
  bucket = "seating-chart-tfstate-${var.aws_account_id}"

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name    = "seating-chart-tfstate"
    Purpose = "Terraform remote state"
  }
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── DynamoDB lock table ────────────────────────────────────────────────────────

resource "aws_dynamodb_table" "tflock" {
  name         = "seating-chart-tflock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name    = "seating-chart-tflock"
    Purpose = "Terraform state locking"
  }
}

# ── GitHub OIDC provider ───────────────────────────────────────────────────────

data "aws_iam_openid_connect_provider" "github" {
  count = 0 # Set to 0 if OIDC provider already exists in account; remove to create
  url   = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]

  tags = {
    Name = "github-actions-oidc"
  }
}

locals {
  github_subject_prefix = "repo:${var.github_org}/${var.github_repo}"
  oidc_provider_arn     = aws_iam_openid_connect_provider.github.arn
}

# ── IAM role: github-actions-infra (Terraform apply) ──────────────────────────

data "aws_iam_policy_document" "github_infra_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["${local.github_subject_prefix}:*"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "github_infra" {
  name               = "github-actions-infra"
  assume_role_policy = data.aws_iam_policy_document.github_infra_trust.json

  tags = {
    Name    = "github-actions-infra"
    Purpose = "GitHub Actions Terraform apply"
  }
}

# Broad permissions for infra management — tighten in production if needed
resource "aws_iam_role_policy_attachment" "github_infra_admin" {
  role       = aws_iam_role.github_infra.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# ── IAM role: github-actions-deploy (frontend + Lambda deploys) ───────────────

data "aws_iam_policy_document" "github_deploy_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["${local.github_subject_prefix}:*"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name               = "github-actions-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_deploy_trust.json

  tags = {
    Name    = "github-actions-deploy"
    Purpose = "GitHub Actions frontend + Lambda deployment"
  }
}

data "aws_iam_policy_document" "github_deploy_policy" {
  # Frontend S3 deploy
  statement {
    effect    = "Allow"
    actions   = ["s3:PutObject", "s3:DeleteObject", "s3:GetObject", "s3:ListBucket"]
    resources = ["arn:aws:s3:::seating-chart-frontend-*", "arn:aws:s3:::seating-chart-frontend-*/*"]
  }
  # CloudFront invalidation
  statement {
    effect    = "Allow"
    actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetDistribution"]
    resources = ["arn:aws:cloudfront::${var.aws_account_id}:distribution/*"]
  }
  # Lambda code update
  statement {
    effect    = "Allow"
    actions   = ["lambda:UpdateFunctionCode", "lambda:GetFunction"]
    resources = ["arn:aws:lambda:us-east-1:${var.aws_account_id}:function:seating-chart-projects-*"]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "github-deploy-policy"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy_policy.json
}

# ── Outputs ────────────────────────────────────────────────────────────────────

output "tfstate_bucket" {
  value       = aws_s3_bucket.tfstate.bucket
  description = "S3 bucket name for Terraform state — use in environments/*/backend.tf"
}

output "tflock_table" {
  value       = aws_dynamodb_table.tflock.name
  description = "DynamoDB table name for Terraform locking"
}

output "github_infra_role_arn" {
  value       = aws_iam_role.github_infra.arn
  description = "IAM role ARN for GitHub Actions Terraform workflows"
}

output "github_deploy_role_arn" {
  value       = aws_iam_role.github_deploy.arn
  description = "IAM role ARN for GitHub Actions deploy workflows"
}
