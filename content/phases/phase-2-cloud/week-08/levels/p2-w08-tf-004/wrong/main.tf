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

resource "aws_instance" "web" {
  ami           = "ami-0b5eea76982371e91" # a teammate bumped this
  instance_type = "t3.small"

  tags = {
    Name = "fde-web"
  }
}
