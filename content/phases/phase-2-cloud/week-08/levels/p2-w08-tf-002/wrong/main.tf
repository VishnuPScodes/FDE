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

variable "env" {
  type    = string
  default = "dev"
}

resource "aws_s3_bucket" "assets" {
  bucket = "fde-dev-assets"
}

output "bucket_arn" {
  value = aws_s3_bucket.assets.arn
}
