terraform {
  backend "s3" {
    # Replace these with values from `terraform output` in infrastructure/bootstrap
    bucket         = "seating-chart-tfstate-449342276858"
    key            = "dev/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "seating-chart-tflock"
    encrypt        = true
  }
}
