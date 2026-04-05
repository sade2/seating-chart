variable "domain_name" {
  description = "App domain (e.g. seating-chart.myurl.com)"
  type        = string
}

variable "hosted_zone_id" {
  description = "Route 53 hosted zone ID for the domain"
  type        = string
}
