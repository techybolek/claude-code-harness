---
name: qdrant-ops
description: Universal Qdrant operations guide. Covers environment defaults (credentials, clusters), correct curl/REST patterns for all operations (collections, points, search, scroll, upsert, delete, snapshots). Load this before any Qdrant task.
---

# Qdrant Operations — Universal Guide

## Environment

- **Active cluster:** `QDRANT_API_URL` → us-east4 GCP (`https://d579ecd5-2fe2-4e6d-8509-77fd94e8cd67.us-east4-0.gcp.cloud.qdrant.io:6333`)
- **Inactive cluster:** `QDRANT_URL` → europe-west3 (returns 404 — skip unless user says otherwise)
- **API key:** `QDRANT_API_KEY` — always set in env, no need to export or prompt
- **Auth header:** `-H "api-key: ${QDRANT_API_KEY}"`
- **Base URL alias:** always set `BASE="${QDRANT_API_URL}"` at top of any multi-command block

```bash
BASE="${QDRANT_API_URL}"
KEY="${QDRANT_API_KEY}"
```

---

## Known Collections (as of 2026-03)

| Name | Points | Vector size | Notes |
|---|---|---|---|
| `tshelpdesk` | 688 | 1024-dim Cosine | TestSavvy helpdesk PDF chunks |
| `tsjobaid_1` | 182 | 1024-dim Cosine | TestSavvy job aids PDF chunks |
| `tro-child-hybrid-v1` | 1,688 | 1536-dim Cosine (dense) | TX early learning docs, fully indexed, hybrid |
| `test_collection_7ebef848` | 205 | 384-dim Cosine | Synthetic batch test data |

---

## REST API Patterns

All operations use `curl`. Pipe through `python3 -m json.tool` for readable output.

### List all collections
```bash
curl -s -H "api-key: ${KEY}" "${BASE}/collections" | python3 -m json.tool
```

### Get collection info (schema, counts, config)
```bash
curl -s -H "api-key: ${KEY}" "${BASE}/collections/<name>" | python3 -m json.tool
```

### Create a collection
```bash
curl -s -X PUT -H "api-key: ${KEY}" -H "Content-Type: application/json" \
  "${BASE}/collections/<name>" \
  -d '{
    "vectors": {
      "size": 1536,
      "distance": "Cosine"
    }
  }' | python3 -m json.tool
```

For **named/hybrid vectors** (dense + sparse):
```bash
-d '{
  "vectors": {
    "dense": {"size": 1536, "distance": "Cosine"},
    "sparse": {}
  }
}'
```

### Delete a collection
```bash
curl -s -X DELETE -H "api-key: ${KEY}" "${BASE}/collections/<name>" | python3 -m json.tool
```

---

## Points — Browse & Inspect

### Scroll (paginate all points)
```bash
curl -s -X POST -H "api-key: ${KEY}" -H "Content-Type: application/json" \
  "${BASE}/collections/<name>/points/scroll" \
  -d '{
    "limit": 10,
    "with_payload": true,
    "with_vector": false
  }' | python3 -m json.tool
```

Use `"offset": <next_page_offset>` from the response to paginate.

### Get points by ID
```bash
curl -s -X POST -H "api-key: ${KEY}" -H "Content-Type: application/json" \
  "${BASE}/collections/<name>/points" \
  -d '{"ids": ["<uuid-or-int>"], "with_payload": true, "with_vector": false}' \
  | python3 -m json.tool
```

### Count points (with optional filter)
```bash
curl -s -X POST -H "api-key: ${KEY}" -H "Content-Type: application/json" \
  "${BASE}/collections/<name>/points/count" \
  -d '{"exact": true}' | python3 -m json.tool
```

---

## Points — Upsert & Delete

### Upsert points
```bash
curl -s -X PUT -H "api-key: ${KEY}" -H "Content-Type: application/json" \
  "${BASE}/collections/<name>/points" \
  -d '{
    "points": [
      {
        "id": "<uuid-or-int>",
        "vector": [0.1, 0.2, ...],
        "payload": {"text": "...", "source": "..."}
      }
    ]
  }' | python3 -m json.tool
```

### Delete points by ID
```bash
curl -s -X POST -H "api-key: ${KEY}" -H "Content-Type: application/json" \
  "${BASE}/collections/<name>/points/delete" \
  -d '{"points": ["<id1>", "<id2>"]}' | python3 -m json.tool
```

### Delete points by filter
```bash
curl -s -X POST -H "api-key: ${KEY}" -H "Content-Type: application/json" \
  "${BASE}/collections/<name>/points/delete" \
  -d '{
    "filter": {
      "must": [{"key": "document_name", "match": {"value": "tshelpdesk"}}]
    }
  }' | python3 -m json.tool
```

### Update payload on existing points
```bash
curl -s -X POST -H "api-key: ${KEY}" -H "Content-Type: application/json" \
  "${BASE}/collections/<name>/points/payload" \
  -d '{
    "payload": {"new_field": "value"},
    "points": ["<id1>"]
  }' | python3 -m json.tool
```

---

## Search

### Vector similarity search
```bash
curl -s -X POST -H "api-key: ${KEY}" -H "Content-Type: application/json" \
  "${BASE}/collections/<name>/points/search" \
  -d '{
    "vector": [0.1, 0.2, ...],
    "limit": 5,
    "with_payload": true,
    "with_vector": false
  }' | python3 -m json.tool
```

### Filtered search
```bash
-d '{
  "vector": [...],
  "limit": 5,
  "filter": {
    "must": [{"key": "metadata.source_type", "match": {"value": "pdf"}}]
  },
  "with_payload": true
}'
```

### Search with named vector (hybrid collections like tro-child-hybrid-v1)
```bash
-d '{
  "vector": {"name": "dense", "vector": [...]},
  "limit": 5,
  "with_payload": true
}'
```

### Recommend (find similar to existing point)
```bash
curl -s -X POST -H "api-key: ${KEY}" -H "Content-Type: application/json" \
  "${BASE}/collections/<name>/points/recommend" \
  -d '{
    "positive": ["<point-id>"],
    "limit": 5,
    "with_payload": true
  }' | python3 -m json.tool
```

---

## Filtering Reference

Filters go inside `"filter": { ... }` blocks. Conditions combine with `must` (AND), `should` (OR), `must_not` (NOT).

```json
{
  "must": [
    {"key": "metadata.source_type", "match": {"value": "pdf"}},
    {"key": "chunk_index", "range": {"gte": 0, "lte": 100}}
  ],
  "should": [
    {"key": "document_name", "match": {"value": "tshelpdesk"}},
    {"key": "document_name", "match": {"value": "tsjobaid"}}
  ]
}
```

---

## Indexes & Performance

### Create payload index (for fast filtered search)
```bash
curl -s -X PUT -H "api-key: ${KEY}" -H "Content-Type: application/json" \
  "${BASE}/collections/<name>/index" \
  -d '{"field_name": "metadata.source_type", "field_schema": "keyword"}' \
  | python3 -m json.tool
```

Field schema types: `keyword`, `integer`, `float`, `bool`, `text`, `geo`, `datetime`

### Collection aliases
```bash
# Create alias
curl -s -X POST -H "api-key: ${KEY}" -H "Content-Type: application/json" \
  "${BASE}/aliases" \
  -d '{"actions": [{"create_alias": {"alias_name": "prod", "collection_name": "<name>"}}]}' \
  | python3 -m json.tool

# List aliases
curl -s -H "api-key: ${KEY}" "${BASE}/aliases" | python3 -m json.tool
```

---

## Cluster & Health

```bash
# Health check
curl -s "${BASE}/healthz"

# Cluster info
curl -s -H "api-key: ${KEY}" "${BASE}/cluster" | python3 -m json.tool

# Collection telemetry
curl -s -H "api-key: ${KEY}" "${BASE}/telemetry" | python3 -m json.tool
```

---

## Snapshots (Backup/Restore)

```bash
# Create snapshot
curl -s -X POST -H "api-key: ${KEY}" "${BASE}/collections/<name>/snapshots" | python3 -m json.tool

# List snapshots
curl -s -H "api-key: ${KEY}" "${BASE}/collections/<name>/snapshots" | python3 -m json.tool
```

---

## Quick Discovery (run in parallel to inspect everything)

```bash
BASE="${QDRANT_API_URL}" && KEY="${QDRANT_API_KEY}"

# All collections with counts
curl -s -H "api-key: $KEY" "$BASE/collections" | python3 -m json.tool

# Details on a specific collection
curl -s -H "api-key: $KEY" "$BASE/collections/tro-child-hybrid-v1" | python3 -m json.tool

# Sample points from a collection
curl -s -X POST -H "api-key: $KEY" -H "Content-Type: application/json" \
  "$BASE/collections/tro-child-hybrid-v1/points/scroll" \
  -d '{"limit": 3, "with_payload": true, "with_vector": false}' | python3 -m json.tool
```
