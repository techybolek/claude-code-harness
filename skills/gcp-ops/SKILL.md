---
name: gcp-ops
description: Google Cloud operations guide for this environment: account/project defaults, gcloud patterns, Cloud Run. Load before any GCP or gcloud task.
---

# GCP Operations — Universal Guide

## Environment

- **Account:** `toromanow@gmail.com` (active, authenticated)
- **CLI:** `gcloud` is at `~/google-cloud-sdk/bin/gcloud` and is not on PATH in Claude sessions — call it by full path

---

## Discovery

```bash
# List all projects
gcloud projects list

# List Cloud Run services in default project
gcloud run services list --project=<project> --format="table(metadata.name,status.url,status.conditions[0].status)"

# List services across ALL projects
for proj in $(gcloud projects list --format="value(projectId)"); do
  echo "=== $proj ===" && gcloud run services list --project=$proj --format="table(metadata.name,status.url)" 2>/dev/null
done

# List all resources in a project (broad)
gcloud asset search-all-resources --scope=projects/<project> --format="table(name,assetType)" 2>/dev/null
```

---

## Service → CLI Pattern Map

| Service | CLI pattern | Notes |
|---|---|---|
| Cloud Run | `gcloud run` | Serverless containers |
| Cloud Build | `gcloud builds` | CI/CD builds |
| Artifact Registry | `gcloud artifacts` | Container images |
| Cloud Storage | `gcloud storage` / `gsutil` | Buckets |
| Cloud SQL | `gcloud sql` | Managed databases |
| IAM | `gcloud iam` | Roles, service accounts |
| Secrets | `gcloud secrets` | Secret Manager |
| Pub/Sub | `gcloud pubsub` | Messaging |
| Logging | `gcloud logging` | Log explorer |

---

## Common Operations

### Cloud Run

```bash
# Describe a service (get full details, env vars, etc.)
gcloud run services describe <service-name> --project=<project> --region=<region>

# View logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=<service-name>" \
  --project=<project> --limit=50 --format="table(timestamp,textPayload)"

# Tail logs (stream)
gcloud beta run services logs tail <service-name> --project=<project> --region=<region>

# Deploy a new revision from existing image
gcloud run deploy <service-name> \
  --image <image-url> \
  --project=<project> \
  --region=<region>

# Update env vars
gcloud run services update <service-name> \
  --set-env-vars KEY=VALUE \
  --project=<project> --region=<region>

# Delete a service
gcloud run services delete <service-name> --project=<project> --region=<region>
```

### Artifact Registry (container images)

```bash
# List repositories
gcloud artifacts repositories list --project=<project>

# List images in a repo
gcloud artifacts docker images list <region>-docker.pkg.dev/<project>/<repo>
```

### Secrets

```bash
# List secrets
gcloud secrets list --project=<project>

# Get a secret value
gcloud secrets versions access latest --secret=<secret-name> --project=<project>
```

### Cloud Storage

```bash
# List buckets
gcloud storage buckets list --project=<project>

# Upload / download
gcloud storage cp file.txt gs://my-bucket/
gcloud storage cp gs://my-bucket/file.txt .
```

---

## Safe Deletion

1. Check what depends on the service first (`gcloud run services describe`)
2. Delete Cloud Run service: `gcloud run services delete <name> --project=... --region=...`
3. Delete associated container images from Artifact Registry if no longer needed
4. Delete secrets if orphaned: `gcloud secrets delete <name> --project=...`

---

## Key Gotchas

| Gotcha | Detail |
|---|---|
| Region required for Cloud Run | Always pass `--region=<region>` (or wherever deployed) |
| Default project | Set with `gcloud config set project <project>` to avoid repeating `--project` |
| `gcloud beta` for log tailing | `gcloud beta run services logs tail` requires beta component |
| Image URL format | `<region>-docker.pkg.dev/<project>/<repo>/<image>:<tag>` |
| Service account auth | For CI/CD use `gcloud auth activate-service-account --key-file=key.json` |
