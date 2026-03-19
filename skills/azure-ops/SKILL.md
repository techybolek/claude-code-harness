---
name: azure-ops
description: Universal Azure operations guide. Covers environment defaults (subscription, credentials), correct az CLI patterns per service, resource discovery, Azure OpenAI/AI Services management, Container Apps deployment (including WSL2 gotchas), and safe cleanup. Load this before any Azure task. Use whenever the user asks about Azure resources, deployments, models, Cognitive Services, OpenAI endpoints, Container Apps, resource groups, or anything involving the az CLI — even if they don't say "Azure" explicitly.
---

# Azure Operations — Universal Guide

## Environment

- **Subscription:** `Azure subscription 1` (`294759b8-daae-4612-98f2-6f0350f95c4f`)
- **CLI:** `az` is installed and authenticated — just run commands
- **Default subscription is already set** — no need to pass `--subscription` unless switching

---

## Known Resources

| Resource | Kind | Resource Group | Deployments |
|---|---|---|---|
| `tro-cf-resource-1` | AIServices | `tro-cf-resource-group-1` | `Cohere-rerank-v4.0-fast` (v1, capacity 20) |
| `openai-eval-tomasz` | OpenAI | `rg-openai-eval` | `gpt-4.1-mini` (2025-04-14, capacity 100) |

---

## Discovery (run in parallel)

```bash
# All Cognitive Services / AI Services / OpenAI accounts
az cognitiveservices account list \
  --query "[].{name:name,kind:kind,rg:resourceGroup,location:location}" \
  -o table

# All deployments across a resource
az cognitiveservices account deployment list \
  --name <resource-name> --resource-group <rg> \
  --query "[].{name:name,model:properties.model.name,version:properties.model.version,capacity:sku.capacity,status:properties.provisioningState}" \
  -o table

# All resource groups
az group list --query "[].{name:name,location:location,state:properties.provisioningState}" -o table

# All resources in a resource group
az resource list --resource-group <rg> \
  --query "[].{name:name,type:type,location:location}" -o table
```

---

## Service → CLI Pattern Map

| Service | CLI pattern | Notes |
|---|---|---|
| Azure OpenAI | `az cognitiveservices account` | kind = `OpenAI` |
| AI Services (multi) | `az cognitiveservices account` | kind = `AIServices` |
| Model deployments | `az cognitiveservices account deployment` | scoped to a resource |
| Container Apps | `az containerapp` | see Container Apps section below |
| Container Registry | `az acr` | `Microsoft.ContainerRegistry` provider must be registered |
| Resource Groups | `az group` | |
| All resources | `az resource` | filter by `--resource-group` or `--resource-type` |
| Role assignments | `az role assignment` | |
| Key Vault | `az keyvault` | |

---

## Common Operations

### List model deployments

```bash
# tro-cf-resource-1 (AIServices)
az cognitiveservices account deployment list \
  --name tro-cf-resource-1 \
  --resource-group tro-cf-resource-group-1 \
  -o table

# openai-eval-tomasz (OpenAI)
az cognitiveservices account deployment list \
  --name openai-eval-tomasz \
  --resource-group rg-openai-eval \
  -o table
```

### Get endpoint & keys for a resource

```bash
az cognitiveservices account show \
  --name <resource-name> --resource-group <rg> \
  --query "{endpoint:properties.endpoint,location:location}" -o json

az cognitiveservices account keys list \
  --name <resource-name> --resource-group <rg> \
  --query "{key1:key1,key2:key2}" -o json
```

### Create a new deployment

```bash
az cognitiveservices account deployment create \
  --name <resource-name> \
  --resource-group <rg> \
  --deployment-name <deployment-name> \
  --model-name <model-name> \
  --model-version <version> \
  --model-format OpenAI \
  --sku-capacity 10 \
  --sku-name Standard
```

### Delete a deployment

```bash
az cognitiveservices account deployment delete \
  --name <resource-name> \
  --resource-group <rg> \
  --deployment-name <deployment-name>
```

### Call a deployed model (REST via az rest)

```bash
# Get endpoint first
ENDPOINT=$(az cognitiveservices account show \
  --name openai-eval-tomasz --resource-group rg-openai-eval \
  --query properties.endpoint -o tsv)

# Chat completion
az rest --method post \
  --url "${ENDPOINT}openai/deployments/gpt-4.1-mini/chat/completions?api-version=2024-02-01" \
  --body '{"messages":[{"role":"user","content":"Hello"}]}'
```

---

## Safe Deletion

**Before deleting a resource:**

1. Check what deployments exist: `az cognitiveservices account deployment list ...`
2. Delete deployments first if needed (some resources block deletion with active deployments)
3. Delete the resource: `az cognitiveservices account delete --name <name> --resource-group <rg>`
4. Delete the resource group only if it's empty or fully owned by you: `az group delete --name <rg>`

```bash
# Delete a resource (prompts for confirmation)
az cognitiveservices account delete \
  --name <resource-name> --resource-group <rg>

# Delete resource group and everything in it — DESTRUCTIVE
az group delete --name <rg> --yes --no-wait
```

---

## Key Gotchas

| Gotcha | Detail |
|---|---|
| `az cognitiveservices` for everything | Both `OpenAI` and `AIServices` resources use `az cognitiveservices account` |
| API version matters | Azure OpenAI REST API requires `?api-version=` — use `2024-02-01` or later |
| Deployment name ≠ model name | Deployment name is what you pass in SDK calls; model name is the underlying model |
| Capacity units | Capacity = thousands of tokens per minute (TPM); `100` = 100K TPM |
| Soft-delete on OpenAI | Deleted OpenAI resources go into soft-delete — use `az cognitiveservices account recover` or purge |
| `--no-wait` on group delete | Group deletion is slow — use `--no-wait` and check with `az group show` |

---

## Container Apps Deployment (WSL2)

### The #1 Rule

**Never use `az containerapp up --source .` from WSL2.** It uploads source via ACR Tasks which cannot reach the WSL2 filesystem — fails with `failed to download context` after already creating ACR and the environment. Always use the manual 3-step flow below.

### Pre-flight

```bash
# Check/register Microsoft.ContainerRegistry (takes 2-3 min if unregistered)
az provider show --namespace Microsoft.ContainerRegistry --query registrationState -o tsv
# If not "Registered":
az provider register --namespace Microsoft.ContainerRegistry
until [ "$(az provider show --namespace Microsoft.ContainerRegistry --query registrationState -o tsv)" = "Registered" ]; do
  echo "Registering..."; sleep 5
done

# Check for existing ACR (az containerapp up creates one even when it fails)
az acr list --resource-group <rg> --query "[].{name:name,loginServer:loginServer}" -o table
```

### Deploy Sequence

```bash
# 1. Build & push
az acr login --name <acr-name>
docker build -t <acr-name>.azurecr.io/<app>:latest .
docker push <acr-name>.azurecr.io/<app>:latest

# 2. Create Container App (CLI auto-discovers ACR creds)
az containerapp create \
  --name <app> \
  --resource-group <rg> \
  --environment <env-name> \
  --image <acr-name>.azurecr.io/<app>:latest \
  --registry-server <acr-name>.azurecr.io \
  --target-port <port> \
  --ingress external \
  --min-replicas 1 --max-replicas 3 \
  --cpu 0.5 --memory 1Gi \
  --query "properties.configuration.ingress.fqdn" -o tsv

# 3. Set secrets (all in one command)
az containerapp secret set \
  --name <app> --resource-group <rg> \
  --secrets "my-key=<VALUE>" "db-pass=<VALUE>"

# 4. Inject secrets + plain env vars
az containerapp update \
  --name <app> --resource-group <rg> \
  --set-env-vars \
    "MY_KEY=secretref:my-key" \
    "DB_PASS=secretref:db-pass" \
    "PLAIN_VAR=value"
```

### Verify

```bash
# Health check
curl -sf https://<fqdn>/ -o /dev/null -w "%{http_code}"

# Check logs if something looks wrong
az containerapp logs show --name <app> --resource-group <rg> --tail 50
```

### Container Apps Gotchas

| Gotcha | Detail |
|--------|--------|
| `up --source .` fails in WSL2 | ACR Tasks can't reach WSL2 filesystem — use manual build+push+create |
| ACR created even when `up` fails | Always `az acr list` before creating a new one |
| `Microsoft.ContainerRegistry` unregistered | First-ever ACR use in a subscription — register and wait 2-3 min |
| 422 on API smoke test | Wrong request body shape — read the app's model schema first |
| `secret list` shows no values | Names only — correct behavior, not a bug |
| `secret set` alone doesn't restart | Need `containerapp update` to inject secrets as env vars and trigger restart |
