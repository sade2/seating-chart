# Bootstrap

Run **once** manually to create the shared Terraform state bucket, DynamoDB lock table, and GitHub OIDC IAM roles. Uses local state (no remote backend required).

## Prerequisites

- AWS CLI configured with admin credentials
- Terraform >= 1.7 installed

## Usage

```bash
cd infrastructure/bootstrap

terraform init

terraform apply \
  -var="github_org=YOUR_GITHUB_ORG" \
  -var="github_repo=seating-chart" \
  -var="aws_account_id=$(aws sts get-caller-identity --query Account --output text)"
```

## After apply

Copy the output values and update:

1. `infrastructure/environments/dev/backend.tf` — replace `ACCOUNT_ID` in the bucket name
2. `infrastructure/environments/prod/backend.tf` — same
3. GitHub Actions Variables (Settings → Variables → Actions):
   - `INFRA_ROLE_ARN` — from `github_infra_role_arn` output
   - `DEPLOY_ROLE_ARN` — from `github_deploy_role_arn` output
   - `ACCOUNT_ID` — your AWS account ID

## Notes

- The S3 bucket and DynamoDB table have `prevent_destroy = true` — never accidentally destroy them
- If a GitHub OIDC provider already exists in your account, remove the `aws_iam_openid_connect_provider` resource and replace `local.oidc_provider_arn` with the existing ARN
