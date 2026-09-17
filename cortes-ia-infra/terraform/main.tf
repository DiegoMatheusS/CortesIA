terraform {

  required_version = ">= 1.9.0, < 2.0.0"
  required_providers {

    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  
}


}

provider "aws" {
 region = var.region 
}

variable "region" {
 type = string
 default = "us-east-1" 
}

variable "name" {
 type = string
 default = "cortes-ia-staging" 
}

variable "media_bucket" {
 type = string 
}

variable "frontend_origin" {
 type = string 
}

variable "db_username" {
 type = string
 default = "cortes_owner" 
}

variable "alert_email" {
 type = string 
}

variable "domain" {
 type = string
 default = "" 
}

variable "route53_zone_id" {
 type = string
 default = "" 
}

variable "certificate_arn" {
 type = string
 default = "" 
}

data "aws_availability_zones" "available" {
 state = "available" 
}

resource "aws_vpc" "main" {

  cidr_block = "10.42.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support = true
  tags = { Name = var.name }

}

resource "aws_subnet" "private" {

  count = 2
  vpc_id = aws_vpc.main.id
  cidr_block = "10.42.${10 + count.index}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]
  tags = { Name = "${var.name}-private-${count.index}" }

}

resource "aws_subnet" "public" {

  count = 2
  vpc_id = aws_vpc.main.id
  cidr_block = "10.42.${count.index}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]

}

resource "aws_internet_gateway" "main" {
 vpc_id = aws_vpc.main.id 
}

resource "aws_route_table" "public" {

  vpc_id = aws_vpc.main.id
  route {
 cidr_block = "0.0.0.0/0"
 gateway_id = aws_internet_gateway.main.id 
}


}

resource "aws_route_table_association" "public" {

  count = 2
  subnet_id = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id

}

resource "aws_eip" "nat" {
 domain = "vpc" 
}

resource "aws_nat_gateway" "main" {

  allocation_id = aws_eip.nat.id
  subnet_id = aws_subnet.public[0].id
  depends_on = [aws_internet_gateway.main]

}

resource "aws_route_table" "private" {

  vpc_id = aws_vpc.main.id
  route {
 cidr_block = "0.0.0.0/0"
 nat_gateway_id = aws_nat_gateway.main.id 
}


}

resource "aws_route_table_association" "private" {

  count = 2
  subnet_id = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id

}

resource "aws_security_group" "app" {

  name = "${var.name}-app"
  vpc_id = aws_vpc.main.id
  egress {
 from_port = 0
 to_port = 0
 protocol = "-1"
 cidr_blocks = ["0.0.0.0/0"] 
}


}

resource "aws_security_group" "db" {

  name = "${var.name}-db"
  vpc_id = aws_vpc.main.id
  ingress {
 from_port = 5432
 to_port = 5432
 protocol = "tcp"
 security_groups = [aws_security_group.app.id] 
}


}

resource "aws_db_subnet_group" "main" {
 name = var.name
 subnet_ids = aws_subnet.private[*].id 
}

resource "aws_db_instance" "main" {

  identifier = var.name
  engine = "postgres"
  instance_class = "db.t4g.small"
  allocated_storage = 30
  max_allocated_storage = 150
  db_name = "cortes"
  username = var.db_username
  manage_master_user_password = true
  db_subnet_group_name = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible = false
  storage_encrypted = true
  backup_retention_period = 14
  deletion_protection = true
  skip_final_snapshot = false
  final_snapshot_identifier = "${var.name}-final"
  multi_az = true
  enabled_cloudwatch_logs_exports = ["postgresql","upgrade"]

}

resource "aws_s3_bucket" "media" {
 bucket = var.media_bucket
 force_destroy = false 
}

resource "aws_s3_bucket_public_access_block" "media" {

  bucket = aws_s3_bucket.media.id
  block_public_acls = true
  block_public_policy = true
  ignore_public_acls = true
  restrict_public_buckets = true

}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {

  bucket = aws_s3_bucket.media.id
  rule {
 apply_server_side_encryption_by_default {
 sse_algorithm = "AES256" 
}
 
}


}

resource "aws_s3_bucket_policy" "tls" {

  bucket = aws_s3_bucket.media.id
  policy = jsonencode({Version="2012-10-17",Statement=[{
Sid="DenyInsecureTransport",Effect="Deny",Principal="*",Action="s3:*",Resource=[aws_s3_bucket.media.arn,"${aws_s3_bucket.media.arn}/*"],Condition={Bool={"aws:SecureTransport"="false"}}
}
]})

}

resource "aws_s3_bucket_cors_configuration" "media" {

  bucket = aws_s3_bucket.media.id
  cors_rule {

    allowed_headers = ["*"]
    allowed_methods = ["PUT","POST","GET","HEAD"]
    allowed_origins = [var.frontend_origin]
    expose_headers = ["ETag"]
    max_age_seconds = 300
  
}


}

resource "aws_s3_bucket_lifecycle_configuration" "media" {

  bucket = aws_s3_bucket.media.id
  rule {

    id = "abort-incomplete"
    status = "Enabled"
    filter {
 prefix = "quarantine/" 
}

    abort_incomplete_multipart_upload {
 days_after_initiation = 1 
}

  
}

  # No generic 120-day object age expiry: account activity controls retention.

}

resource "aws_sqs_queue" "dlq" {

  name = "${var.name}-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled = true

}

resource "aws_sqs_queue" "jobs" {

  name = "${var.name}-jobs"
  visibility_timeout_seconds = 120
  message_retention_seconds = 345600
  sqs_managed_sse_enabled = true
  redrive_policy = jsonencode({deadLetterTargetArn=aws_sqs_queue.dlq.arn,maxReceiveCount=5})

}

resource "aws_sqs_queue" "events" {

  name = "${var.name}-events"
  visibility_timeout_seconds = 120
  message_retention_seconds = 345600
  sqs_managed_sse_enabled = true
  redrive_policy = jsonencode({deadLetterTargetArn=aws_sqs_queue.dlq.arn,maxReceiveCount=5})

}

resource "aws_ecr_repository" "images" {

  for_each = toset(["api","web","worker","media"])
  name = "${var.name}/${each.key}"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
 scan_on_push = true 
}


}

resource "aws_ecs_cluster" "main" {

  name = var.name
  setting {
 name = "containerInsights"
 value = "enabled" 
}


}

resource "aws_cloudwatch_log_group" "app" {

  name = "/ecs/${var.name}"
  retention_in_days = 30

}

resource "aws_secretsmanager_secret" "runtime" {

  name = "${var.name}/runtime"
  recovery_window_in_days = 30
  # Populate through Secrets Manager outside Terraform state, never tfvars.

}

resource "aws_sns_topic" "alerts" {
 name = "${var.name}-alerts" 
}

resource "aws_sns_topic_subscription" "email" {

  topic_arn = aws_sns_topic.alerts.arn
  protocol = "email"
  endpoint = var.alert_email

}

resource "aws_cloudwatch_metric_alarm" "dlq" {

  alarm_name = "${var.name}-dead-letters"
  namespace = "AWS/SQS"
  metric_name = "ApproximateNumberOfMessagesVisible"
  statistic = "Maximum"
  period = 60
  evaluation_periods = 1
  threshold = 0
  comparison_operator = "GreaterThanThreshold"
  dimensions = {QueueName=aws_sqs_queue.dlq.name}
  alarm_actions = [aws_sns_topic.alerts.arn]

}

resource "aws_cloudwatch_metric_alarm" "queue_age" {

  alarm_name = "${var.name}-queue-age"
  namespace = "AWS/SQS"
  metric_name = "ApproximateAgeOfOldestMessage"
  statistic = "Maximum"
  period = 60
  evaluation_periods = 3
  threshold = 600
  comparison_operator = "GreaterThanThreshold"
  dimensions = {QueueName=aws_sqs_queue.jobs.name}
  alarm_actions = [aws_sns_topic.alerts.arn]

}

output "private_subnets" {
 value = aws_subnet.private[*].id 
}

output "app_security_group" {
 value = aws_security_group.app.id 
}

output "db_endpoint" {
 value = aws_db_instance.main.address 
}

output "db_secret_arn" {
 value = aws_db_instance.main.master_user_secret[0].secret_arn
 sensitive = true 
}

output "runtime_secret_arn" {
 value = aws_secretsmanager_secret.runtime.arn 
}

output "bucket" {
 value = aws_s3_bucket.media.id 
}

output "jobs_queue" {
 value = aws_sqs_queue.jobs.url 
}

output "events_queue" {
 value = aws_sqs_queue.events.url 
}

output "repositories" {
 value = {for k,v in aws_ecr_repository.images:k=>v.repository_url} 
}

output "cluster" {
 value = aws_ecs_cluster.main.name 
}

