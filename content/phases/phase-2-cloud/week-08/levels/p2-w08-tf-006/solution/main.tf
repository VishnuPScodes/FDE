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
  for_each = toset(var.teams)
  bucket   = "fde-${each.key}-data"
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

resource "aws_iam_role_policy_attachment" "s3_read" {
  role       = aws_iam_role.app.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess"
}

output "role_arn" {
  value = aws_iam_role.app.arn
}
