# Describe your cloud in code

Clicking around the AWS console works once. It breaks when a second person repeats the steps, or when you need the same setup in Mumbai and again for a test team. Terraform fixes this. You write down what you want in plain text files. Terraform compares that text with what exists and makes the cloud match.

A Terraform file is made of blocks. A resource block says "I want this thing to exist".

    resource "aws_s3_bucket" "logs" {
      bucket = "fde-mumbai-logs-2026"
    }

The first label is the type. The second is your own name for it. Other blocks can point at it as aws_s3_bucket.logs.id. When one block uses another, Terraform knows to build the bucket first.

Variables let one file serve many setups. Write variable "env" with a default, then use it inside text as "fde-${var.env}-assets". A file named terraform.tfvars can set the value. An output block prints a value you care about, such as an ARN, after the run.

The daily loop has three commands. Run terraform init once to download the AWS plugin. Run terraform plan to preview. Run terraform apply to do it. Terraform remembers what it built in a state file. That file is how it knows what to change next time.

Read the plan carefully. A plus sign means create. A tilde means change in place. A minus means destroy. The mark -/+ means destroy and create again. Some arguments cannot change on a live thing, such as the AMI of a server or the name of a bucket. The plan tags those with "forces replacement". A replaced server gets a new id and loses its disk.

Drift is when someone edits a resource by hand in the console. Terraform notices on the next plan and shows the difference. Apply to put things back, or change the file if the hand edit was right.

The simulator here keeps a pretend AWS account in your browser. Nothing real is created, and no bill arrives.
