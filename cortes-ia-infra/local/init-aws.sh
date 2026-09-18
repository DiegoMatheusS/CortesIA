#!/bin/sh
set -eu
awslocal s3api create-bucket --bucket cortes-local
awslocal s3api put-public-access-block --bucket cortes-local --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
awslocal s3api put-bucket-cors --bucket cortes-local --cors-configuration '{"CORSRules":[{"AllowedOrigins":["http://localhost:3000","http://127.0.0.1:3000"],"AllowedMethods":["PUT","GET","HEAD","POST"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":300}]}'
awslocal s3api put-bucket-lifecycle-configuration --bucket cortes-local --lifecycle-configuration '{"Rules":[{"ID":"abort-multipart","Status":"Enabled","Filter":{"Prefix":"quarantine/"},"AbortIncompleteMultipartUpload":{"DaysAfterInitiation":1}}]}'
awslocal sqs create-queue --queue-name cortes-dlq
awslocal sqs create-queue --queue-name cortes-jobs --attributes '{"VisibilityTimeout":"120","RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:us-east-1:000000000000:cortes-dlq\",\"maxReceiveCount\":\"5\"}"}'
awslocal sqs create-queue --queue-name cortes-events --attributes '{"VisibilityTimeout":"120","RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:us-east-1:000000000000:cortes-dlq\",\"maxReceiveCount\":\"5\"}"}'
