# ── DynamoDB Module ────────────────────────────────────────────────────────────

variable "env" {
  description = "Environment name (dev | prod)"
  type        = string
}

variable "enable_pitr" {
  description = "Enable Point-in-Time Recovery"
  type        = bool
  default     = false
}

# ── Table ──────────────────────────────────────────────────────────────────────

resource "aws_dynamodb_table" "main" {
  name         = "seating-chart-${var.env}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  # GSI for userId + updatedAt queries (admin / recently-updated sort — v2)
  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "updatedAt"
    type = "N"
  }

  global_secondary_index {
    name            = "GSI1"
    hash_key        = "userId"
    range_key       = "updatedAt"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = var.enable_pitr
  }

  tags = {
    Environment = var.env
  }
}

# ── Outputs ────────────────────────────────────────────────────────────────────

output "table_name" {
  value = aws_dynamodb_table.main.name
}

output "table_arn" {
  value = aws_dynamodb_table.main.arn
}
