---
name: gcp-ops
description: Universal Google Cloud (GCP) operations guide. Covers environment defaults (account, projects), correct gcloud CLI patterns per service, resource discovery, Cloud Run management, and safe cleanup. Load this before any GCP task. Use whenever the user asks about Google Cloud resources, Cloud Run, GCP projects, deployments, or anything involving the gcloud CLI — even if they don't say "GCP" explicitly.
---

# GCP Operations — Universal Guide

## Environment

- **Account:** `toromanow@gmail.com` (active, authenticated)
- **CLI:** `gcloud` is installed and authenticated — just run commands
- **Default project:** `docker-app-20250605` — where all active services live

---

## Known Projects

| Project ID | Name | Has Resources |
|---|---|---|
| `docker-app-20250605` | Docker App | ✅ All Cloud Run services |
| `gen-lang-client-0766375358` | Generative Language Client | — |
| `integromat-415100` | integromat | — |
| `supabase1-467000` | Supabase1 | — |
| `tptest1-413214` | tptest1 | — |
| `tro-android-1` | tro-android-1 | — |
| `vocal-tracer-412722` | tut1 | — |

## Known Cloud Run Services (`docker-app-20250605`)

| Service | Status | URL |
|---|---|---|
| `childcare-assistant` | ✅ Running | `childcare-assistant-usozgowdxq-uc.a.run.app` |
| `flashcard-wizard` | ✅ Running | `flashcard-wizard-usozgowdxq-uc.a.run.app` |
| `tsai-services` | ❌ Not ready | `tsai-services-usozgowdxq-uc.a.run.app` |
| `tsc-doc-img` | ❌ Not ready | — |
| `tsr-auth-service` | ✅ Running | `tsr-auth-service-usozgowdxq-uc.a.run.app` |
| `tsr-datagrid-service` | ✅ Running | `tsr-datagrid-service-usozgowdxq-uc.a.run.app` |
| `tsr-frontend` | ✅ Running | `tsr-frontend-usozgowdxq-uc.a.run.app` |
| `tsr-testcase-service` | ✅ Running | `tsr-testcase-service-usozgowdxq-uc.a.run.app` |
| `tx-childcare-backend` | ✅ Running | `tx-childcare-backend-usozgowdxq-uc.a.run.app` |
| `tx-childcare-frontend` | ✅ Running | `tx-childcare-frontend-usozgowdxq-uc.a.run.app` |

---

## Discovery

```bash
# List all projects
gcloud projects list

# List Cloud Run services in default project
gcloud run services list --project=docker-app-20250605 --format="table(metadata.name,status.url,status.conditions[0].status)"

# List services across ALL projects
for proj in docker-app-20250605 gen-lang-client-0766375358 integromat-415100 supabase1-467000 tptest1-413214 tro-android-1 vocal-tracer-412722; do
  echo "=== $proj ===" && gcloud run services list --project=$proj --format="table(metadata.name,status.url)" 2>/dev/null
done

# List all resources in a project (broad)
gcloud asset search-all-resources --scope=projects/docker-app-20250605 --format="table(name,assetType)" 2>/dev/null
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
gcloud run services describe <service-name> --project=docker-app-20250605 --region=us-central1

# View logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=<service-name>" \
  --project=docker-app-20250605 --limit=50 --format="table(timestamp,textPayload)"

# Tail logs (stream)
gcloud beta run services logs tail <service-name> --project=docker-app-20250605 --region=us-central1

# Deploy a new revision from existing image
gcloud run deploy <service-name> \
  --image <image-url> \
  --project=docker-app-20250605 \
  --region=us-central1

# Update env vars
gcloud run services update <service-name> \
  --set-env-vars KEY=VALUE \
  --project=docker-app-20250605 --region=us-central1

# Delete a service
gcloud run services delete <service-name> --project=docker-app-20250605 --region=us-central1
```

### Artifact Registry (container images)

```bash
# List repositories
gcloud artifacts repositories list --project=docker-app-20250605

# List images in a repo
gcloud artifacts docker images list <region>-docker.pkg.dev/docker-app-20250605/<repo>
```

### Secrets

```bash
# List secrets
gcloud secrets list --project=docker-app-20250605

# Get a secret value
gcloud secrets versions access latest --secret=<secret-name> --project=docker-app-20250605
```

### Cloud Storage

```bash
# List buckets
gcloud storage buckets list --project=docker-app-20250605

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
| Region required for Cloud Run | Always pass `--region=us-central1` (or wherever deployed) |
| Default project | Set with `gcloud config set project docker-app-20250605` to avoid repeating `--project` |
| `gcloud beta` for log tailing | `gcloud beta run services logs tail` requires beta component |
| Image URL format | `us-central1-docker.pkg.dev/<project>/<repo>/<image>:<tag>` |
| Service account auth | For CI/CD use `gcloud auth activate-service-account --key-file=key.json` |
