# AWS core: storage, identity, network, servers

AWS rents you computers and services by the hour or the gigabyte. Two habits matter from day one: lock things down, and switch off what you do not use. These levels use a safe copy of AWS in the Mumbai region (ap-south-1). Nothing real is created or billed.

## The aws command

Every command looks like `aws <service> <action> --options`. Use `--query Vpc.VpcId` to pick one part of the answer and `--output text` to print it plainly, so you can save it in a shell variable:

    VPC=$(aws ec2 create-vpc --cidr-block 10.0.0.0/16 --query Vpc.VpcId --output text)
    aws ec2 create-subnet --vpc-id $VPC --cidr-block 10.0.1.0/24

## S3 buckets

A bucket holds files. Bucket names are shared worldwide, and outside us-east-1 you must say where the bucket lives:

    aws s3api create-bucket --bucket fde-invoices-mumbai \
      --create-bucket-configuration LocationConstraint=ap-south-1

Block Public Access has four switches. Turn all four on unless you truly want a public website, because open buckets are a common cause of data leaks. Versioning lets you recover a file that was overwritten.

## IAM: who can do what

A user is a person or program. A policy lists statements, each with an Effect (Allow or Deny), Actions and Resources. Least privilege means giving only what is needed: a report tool that reads files should not get `AmazonS3FullAccess`.

    {"Version":"2012-10-17","Statement":[
      {"Effect":"Allow","Action":"s3:GetObject","Resource":"arn:aws:s3:::fde-reports-mumbai/*"},
      {"Effect":"Allow","Action":"s3:ListBucket","Resource":"arn:aws:s3:::fde-reports-mumbai"}]}

`ListBucket` applies to the bucket, and `GetObject` applies to the files inside it (`/*`).

IAM decides in three steps. Everything is denied by default. An Allow opens something up. An explicit Deny always wins, even if ten other policies allow it. When access is blocked, ask the simulator:

    aws iam simulate-principal-policy \
      --policy-source-arn arn:aws:iam::123456789012:user/intern \
      --action-names s3:PutObject \
      --resource-arns arn:aws:s3:::fde-reports-mumbai/uploads/a.csv

It answers `allowed`, `implicitDeny` (nothing allowed it) or `explicitDeny` (a Deny matched). Then read the user's policies and find the Deny.

## VPC and security groups

A VPC is your private network, such as `10.0.0.0/16`. Subnets are slices of it, such as `10.0.1.0/24`, each in one Availability Zone. Use two zones so one outage does not stop you. A subnet is public when its route table sends `0.0.0.0/0` to an internet gateway, and private otherwise. Databases belong in private subnets.

A security group is a server's firewall. Only listed inbound traffic gets in. `0.0.0.0/0` means the whole internet, which is fine for web ports 80 and 443. A `/32` means one address, which is right for SSH (port 22) from your office. Never open port 22 to `0.0.0.0/0`, because bots scan for it within minutes.

## EC2, cost and tags

    aws ec2 run-instances --image-id ami-0abcdef1234567890 --instance-type t3.micro \
      --subnet-id $SUBNET --security-group-ids $SG \
      --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=fde-web-1}]'

A `t3.micro` left on all month costs about ₹650. An `m5.xlarge` costs about ten times that. A stopped instance stops the hourly charge but its disk still costs a little. A terminated instance is deleted with its disk. Idle NAT gateways (about ₹3,400 a month) and unused Elastic IPs also bill, so delete them when you finish. The Console panel shows an estimated monthly bill in rupees.

Tags are Key and Value labels such as `Project=fde-learning`. They show who owns a resource and let finance group the bill by project. Add them later with `aws ec2 create-tags --resources <ids> --tags Key=Env,Value=dev`.

Before you change anything, run `aws sts get-caller-identity` to see who you are, check the region, and read errors fully: AWS names the action and the resource that was denied.
