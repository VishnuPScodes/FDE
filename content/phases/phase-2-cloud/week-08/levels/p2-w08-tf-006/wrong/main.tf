terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "ap-south-1"
}

variable "teams" {
  type    = list(string)
  default = ["billing", "orders"]
}

resource "aws_s3_bucket" "team" {
  count  = length(var.teams)
  bucket = "fde-${var.teams[count.index]}-data"
}

resource "aws_iam_role" "app" {
  name = "fde-app-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

output "role_arn" {
  value = aws_iam_role.app.arn
}
