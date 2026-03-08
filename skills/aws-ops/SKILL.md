---
name: aws-ops
description: Universal AWS operations guide. Covers environment defaults (region, credentials), correct CLI patterns per service, resource discovery, deployment (SAM/CloudFormation), Bedrock/Bedrock Agent, and safe cleanup. Load this before any AWS task.
---

# AWS Operations — Universal Guide

## Environment

- **Default region:** `us-east-1` (set in `~/.aws/config` — never need `--region` unless targeting another region)
- **Credentials:** configured via `~/.aws/credentials` or environment — always available, no need to verify
- **CLI:** `aws` is installed and authenticated — just run commands

---

## Discovery (always run in parallel)

```bash
aws ec2 describe-instances \
  --query 'Reservations[].Instances[].{ID:InstanceId,Type:InstanceType,State:State.Name,Name:Tags[?Key==`Name`]|[0].Value}' \
  --output table

aws lambda list-functions \
  --query 'Functions[].{Name:FunctionName,Runtime:Runtime}' --output table

aws s3 ls

aws rds describe-db-instances \
  --query 'DBInstances[].{ID:DBInstanceIdentifier,Engine:Engine,Status:DBInstanceStatus}' \
  --output table

aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE ROLLBACK_COMPLETE \
  --query 'StackSummaries[].{Name:StackName,Status:StackStatus}' --output table

aws apigateway get-rest-apis \
  --query 'items[].{ID:id,Name:name}' --output table

aws bedrock-agent list-knowledge-bases \
  --query 'knowledgeBaseSummaries[].{ID:knowledgeBaseId,Name:name,Status:status}' --output table
```

---

## Service → CLI Namespace Map

| Service | CLI command | Notes |
|---|---|---|
| EC2 | `aws ec2` | |
| S3 | `aws s3` / `aws s3api` | `s3` for high-level ops, `s3api` for versioning |
| Lambda | `aws lambda` | |
| CloudFormation | `aws cloudformation` | |
| SAM | `sam build && sam deploy` | Uses `~/.aws/config` region |
| API Gateway (REST) | `aws apigateway` | |
| API Gateway (HTTP/WS) | `aws apigatewayv2` | |
| RDS | `aws rds` | |
| DynamoDB | `aws dynamodb` | |
| IAM | `aws iam` | Global, no region |
| Bedrock (models, guardrails) | `aws bedrock` | |
| Bedrock Knowledge Bases / Agents | `aws bedrock-agent` | NOT `aws bedrock` |
| Bedrock runtime inference | `aws bedrock-runtime` | |
| SQS | `aws sqs` | |
| SNS | `aws sns` | |
| ECR | `aws ecr` | |
| ECS | `aws ecs` | |
| Secrets Manager | `aws secretsmanager` | |
| SSM Parameter Store | `aws ssm` | |

---

## Deployment Patterns

### SAM (Serverless)

```bash
sam build
sam deploy --guided          # first time (creates samconfig.toml)
sam deploy                   # subsequent deploys
sam logs -n FunctionName --tail
sam delete                   # tear down stack
```

### CloudFormation direct

```bash
# Deploy / update
aws cloudformation deploy \
  --template-file template.yaml \
  --stack-name my-stack \
  --capabilities CAPABILITY_IAM

# Check stack outputs
aws cloudformation describe-stacks \
  --stack-name my-stack \
  --query 'Stacks[0].Outputs' --output table

# List stack resources
aws cloudformation list-stack-resources --stack-name my-stack \
  --query 'StackResourceSummaries[].{Type:ResourceType,ID:PhysicalResourceId,Status:ResourceStatus}' \
  --output table
```

---

## Common Operations

### Lambda

```bash
# Invoke
aws lambda invoke --function-name my-fn --payload '{"key":"value"}' response.json
cat response.json

# View logs
aws logs tail /aws/lambda/my-fn --follow

# Update code
aws lambda update-function-code --function-name my-fn --zip-file fileb://function.zip
```

### S3

```bash
# Upload
aws s3 cp file.txt s3://my-bucket/
aws s3 sync ./dist s3://my-bucket/ --delete

# Download
aws s3 cp s3://my-bucket/file.txt .

# List with sizes
aws s3 ls s3://my-bucket --human-readable --summarize
```

### Bedrock Knowledge Base

```bash
# List KBs
aws bedrock-agent list-knowledge-bases

# Get KB details
aws bedrock-agent get-knowledge-base --knowledge-base-id KB_ID

# List data sources
aws bedrock-agent list-data-sources --knowledge-base-id KB_ID

# Sync data source
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id KB_ID \
  --data-source-id DS_ID

# Query KB (via retrieve)
aws bedrock-agent-runtime retrieve \
  --knowledge-base-id KB_ID \
  --retrieval-query '{"text": "your question"}'
```

### Secrets Manager

```bash
# Get secret
aws secretsmanager get-secret-value --secret-id my-secret --query SecretString --output text

# Create secret
aws secretsmanager create-secret --name my-secret --secret-string '{"key":"value"}'
```

---

## Safe Deletion (CF Stacks)

**Order matters:**

1. Empty S3 buckets the stack owns (CF can't delete non-empty buckets)
2. Delete CF stack — it handles Lambda, IAM roles, API GW automatically
3. Delete standalone S3 buckets not in a stack

```bash
# Empty standard bucket
aws s3 rm s3://my-bucket --recursive

# Empty versioned bucket (SAM buckets are always versioned)
aws s3api delete-objects --bucket my-bucket \
  --delete "$(aws s3api list-object-versions --bucket my-bucket \
    --query '{Objects: Versions[].{Key:Key,VersionId:VersionId}}' --output json)"
aws s3api delete-objects --bucket my-bucket \
  --delete "$(aws s3api list-object-versions --bucket my-bucket \
    --query '{Objects: DeleteMarkers[].{Key:Key,VersionId:VersionId}}' --output json)"
aws s3 rb s3://my-bucket

# Delete stack and wait
aws cloudformation delete-stack --stack-name my-stack
aws cloudformation wait stack-delete-complete --stack-name my-stack

# Fix DELETE_FAILED (resource already deleted externally)
aws cloudformation delete-stack --stack-name my-stack \
  --retain-resources LogicalResourceId
```

---

## Key Gotchas

| Gotcha | Detail |
|---|---|
| Wrong Bedrock namespace | Knowledge Bases = `bedrock-agent`, not `bedrock` |
| Versioned S3 buckets | `rm --recursive` leaves versions behind — use `s3api delete-objects` |
| CF delete order | Empty S3 first or stack goes DELETE_FAILED |
| SAM bucket | Always versioned — use full version-deletion pattern |
| `--retain-resources` | Takes **logical resource ID** from CF template, not physical bucket name |
| IAM is global | No region needed for `aws iam` commands |
