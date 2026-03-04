---
description: Deepen a refined feature spec with detailed technical architecture and design
---

You are taking an existing refined feature spec (output of `/spec:refine`) and deepening it with detailed technical architecture, API contracts, data flows, and implementation constraints.

## Your Task

1. **Read the provided spec** - Understand the feature, requirements, and technical context already captured.

2. **Identify technical gaps** - The refined spec focuses on WHAT and WHY. You need to fill in the HOW at an architectural level. Look for gaps in:
   - **Architecture**: How do the components connect? What's the request/response flow?
   - **API Contracts**: What are the exact endpoints, payloads, and response shapes?
   - **Service Configuration**: What infrastructure resources need specific settings? (timeouts, memory, regions, quotas)
   - **Data Flow**: How does data move through the system end-to-end? What transformations happen?
   - **Integration Details**: What SDK methods, API versions, or service-specific details are needed?
   - **Error Strategy**: What errors can each component produce? How do they propagate?
   - **Environment & Config**: What environment variables, secrets, or config files are needed?
   - **Deployment**: What are the concrete deployment steps and prerequisites?
   - **Automated Testing** *(high priority)*: What is the complete test strategy? What test categories exist? How does each test validate correctness? How do tests handle non-determinism (e.g., LLM output variability)? What is the exact test execution command? What does the test environment require?

3. **Ask 2-4 technical questions at a time** - Focus on decisions that affect architecture and testability, not cosmetic choices. **Always include at least one testing question in your first round.** Examples:
   - "Should the backend use Node.js 20 or 22? This affects available library versions."
   - "REST API or GraphQL? REST is simpler; GraphQL gives clients more flexibility. Which fits better?"
   - "Should the frontend call the API via fetch or use a lightweight SDK wrapper?"
   - "What's the maximum request payload size before rejection? (affects memory and processing costs)"
   - "For testing: should tests call the deployed API (true E2E) or invoke the handler functions directly (faster, no deployment needed)? Or both?"
   - "How should tests handle LLM non-determinism? Substring matching on key facts, or a more flexible semantic check?"
   - "Should tests run in CI/CD automatically, or are they manual-run only for now?"

4. **Iterate until technical design is complete** - Keep asking until you can describe every component's configuration, every API contract, and every data flow.

5. **Write the technical spec** to `SPECS/TECHNICAL/[feature-name]-tech-[YYYY-MM-DD].md` using the structure below.

## Output Format

```markdown
# Technical Design: [Title]

**Date:** [YYYY-MM-DD]
**Status:** Technical Design
**Source Spec:** [path to the refined feature spec]

## Architecture Overview

[2-3 sentence summary of the technical architecture]

### Component Diagram

```
[ASCII diagram showing all components and their connections]
```

### Technology Stack

| Layer | Technology | Version/Details |
|-------|-----------|-----------------|
| [e.g., Frontend] | [e.g., Vanilla JS] | [e.g., ES6+, no build step] |
| [e.g., API] | [e.g., Express / FastAPI / REST framework] | [e.g., v5, CORS enabled] |
| ... | ... | ... |

## API Contracts

### [Endpoint 1: e.g., POST /chat]

**Method:** [HTTP method]
**URL:** [path]
**Content-Type:** [e.g., application/json]

**Request Body:**
```json
{
  "field": "type — description"
}
```

**Response (200):**
```json
{
  "field": "type — description"
}
```

**Error Responses:**

| Status | Body | When |
|--------|------|------|
| [code] | `{"error": "message"}` | [condition] |

[Repeat for each endpoint]

## Data Flow

### [Flow 1: e.g., User Asks a Question]

```
[Step-by-step flow with numbered steps, showing data transformation at each stage]

1. Client → API Gateway / Load Balancer
   Payload: { query, context[] }

2. API Gateway → Backend Service
   Request: { body: <json string>, headers, ... }

3. Backend → Data Store / Search Index
   API: search() with query=<query>
   Response: { results: [{ content, score, metadata }] }

4. Backend → External Service / AI Model
   API: generate() with messages=<context + query>
   Response: { output: { content } }

5. Backend → API Gateway → Client
   Response: { result, metadata? }
```

[Repeat for each significant flow]

## Service Configuration

### [Service 1: e.g., Backend Server / Function]

| Setting | Value | Rationale |
|---------|-------|-----------|
| [e.g., Runtime] | [e.g., Node.js 20] | [e.g., LTS, broad library support] |
| [e.g., Memory] | [e.g., 256 MB] | [e.g., Sufficient for API-call-only workload] |
| [e.g., Timeout] | [e.g., 60s] | [e.g., External API calls can take 10-30s] |

[Repeat for each service]

### Permissions & Access Control

[Define the permissions model for the system: service accounts, API keys, roles, scopes, or platform-specific access policies. Specify least-privilege access for each component.]

## Environment & Configuration

### Environment Variables

| Variable | Source | Description |
|----------|--------|-------------|
| [e.g., DATABASE_URL] | [e.g., environment config / secrets manager] | [description] |
| [e.g., API_KEY] | [e.g., secrets manager] | [description] |

### Configuration Files

| File | Purpose | Format |
|------|---------|--------|
| [e.g., config/settings.yaml] | [e.g., Application configuration] | [e.g., YAML] |

## Error Handling Strategy

### Error Propagation Chain

| Source | Error | Handling | User Sees |
|--------|-------|----------|-----------|
| [e.g., Database] | [e.g., No results found] | [e.g., Return empty set, show "no results" message] | [e.g., "No matching records found..."] |
| [e.g., External API] | [e.g., Rate limit exceeded] | [e.g., Return 503 with retry-after] | [e.g., "Service is busy, please try again"] |
| [e.g., Backend] | [e.g., Timeout] | [e.g., Gateway returns 504] | [e.g., "Request timed out, please try again"] |

### Retry Strategy

[Describe retry behavior for each integration point: exponential backoff, max retries, circuit breaker if applicable]

## Frontend Technical Details

### State Management

[How is state managed? What's stored where? What triggers re-renders?]

### API Integration

[How does the frontend call the backend? Error handling? Loading states?]

### Browser Compatibility

[Target browsers, any polyfills needed, CSS approach]

## Deployment Steps

### Prerequisites

- [ ] [e.g., CLI tools configured with appropriate credentials]
- [ ] [e.g., Required service access enabled in target environment]

### Deployment Order

1. [Step 1: e.g., Provision database and run migrations]
   ```bash
   [exact command or description]
   ```
2. [Step 2: e.g., Deploy backend service]
   ```bash
   [exact command or description]
   ```

[Continue for all deployment steps in order]

## Constraints & Limits

| Constraint | Value | Impact |
|-----------|-------|--------|
| [e.g., Max request payload] | [e.g., 10 MB] | [e.g., Limits upload size] |
| [e.g., Database connection pool] | [e.g., 20 connections] | [e.g., Limits concurrent queries] |
| [e.g., Gateway timeout] | [e.g., 30s] | [e.g., Must ensure backend responds within this window] |

## Automated Testing Strategy

**This section is CRITICAL. Every feature must ship with a concrete, executable test plan. Tests are not optional — they are a first-class deliverable equal in importance to the implementation itself.**

### Test Philosophy

[State the testing approach: real API calls vs mocks, integration vs unit, why this strategy was chosen for this project]

### Test Environment

| Requirement | Details |
|-------------|---------|
| **Credentials** | [What credentials/permissions are needed to run tests?] |
| **Environment Variables** | [List every env var tests depend on] |
| **Network** | [Internet access needed? VPN? Specific endpoints?] |
| **Setup Commands** | [Any one-time setup before tests can run?] |
| **Teardown** | [Any cleanup after tests? Are tests idempotent?] |

### Test Execution

```bash
# Run all tests
[exact command]

# Run specific test suite
[exact command for each suite]

# Run with verbose output
[exact command]
```

**Expected run time:** [estimate, important for CI/CD planning]
**Expected cost per run:** [if tests hit paid APIs — e.g., external service invocations]

### Test Matrix

| Test ID | Category | Description | Input | Expected Output | Validation Method |
|---------|----------|-------------|-------|-----------------|-------------------|
| T-01 | [e.g., Unit / Integration / E2E] | [what is being tested] | [input data or scenario] | [expected result] | [e.g., substring match, status code, JSON schema] |
| T-02 | ... | ... | ... | ... | ... |

### Test Architecture

```
[ASCII diagram showing how tests interact with the system]

Example:
  pytest ──→ service.py ──→ Database (REAL)
                          ──→ External API (REAL)

  pytest ──→ request handler ──→ (same as above, invoked locally)

  pytest ──→ HTTP request ──→ API Gateway ──→ Backend (DEPLOYED, E2E only)
```

### Test Categories

#### [Category 1: e.g., Unit Tests]

- **Scope:** [What do these tests cover? What do they NOT cover?]
- **Dependencies:** [Real services? Mocks? Local only?]
- **Files:** [e.g., `tests/test_chatbot.py`]
- **Count:** [number of tests]

| Test | Function/Scenario | Assertion |
|------|-------------------|-----------|
| [name] | [what it tests] | [what it asserts] |

#### [Category 2: e.g., Integration Tests]

[Same structure as above]

#### [Category 3: e.g., Context Preservation Tests]

[Same structure — especially important for multi-turn or stateful features]

### Edge Case Tests

| Test | Edge Case | Expected Behavior | Why This Matters |
|------|-----------|-------------------|------------------|
| [name] | [scenario] | [what should happen] | [what breaks if this fails] |

### Test Reliability & Flakiness

- **LLM variability:** [How do tests account for non-deterministic model output? Substring match? Regex? Multiple acceptable answers?]
- **Rate limiting:** [Can tests hit API rate limits? How to handle?]
- **Timeouts:** [What timeout values do tests use? How do they handle slow responses?]
- **Pass threshold:** [e.g., "All tests must pass" or "90% pass rate acceptable due to LLM variability"]
- **Retry policy:** [Should failed tests be retried? How many times?]

### CI/CD Integration

[How should tests run in a pipeline? Any special considerations for automated runs?]

- **Trigger:** [e.g., on every push, on PR, manual only]
- **Secrets:** [What secrets must be available in CI?]
- **Parallelism:** [Can test suites run in parallel?]
- **Artifacts:** [Should test results be stored? Logs? Screenshots?]

## Open Questions

- [ ] [Any remaining technical decisions that need resolution]

## Notes

[Additional technical context, gotchas, or references]
```

## Example

**Input spec says:** "Backend: Python API behind a reverse proxy"

**You ask:**
1. "API framework: Flask or FastAPI? FastAPI gives you automatic OpenAPI docs and async support. Flask is simpler and more widely known. For a small service, either works — do you have a preference?"
2. "Deployment packaging: single module or a full project with dependency management (e.g., Poetry, pip-tools)? If there are no external dependencies beyond the standard library, a single module keeps it simple. Confirm?"
3. "CORS: The frontend will be on a different origin than the API. Should we configure CORS in the framework middleware, or will you use a reverse proxy to serve both under the same origin?"

[Continue until all technical details are resolved]

## Guidelines

**CRITICAL: Only deepen — don't contradict the source spec**
- The refined spec is your source of truth for WHAT to build
- You are adding HOW details, not changing requirements
- If you spot a conflict between a requirement and a technical constraint, flag it as an open question
- If the source spec explicitly chose a technology, use it — don't suggest alternatives unless asked

**Technical depth principles**
- Every API must have a defined contract (request/response shapes)
- Every service must have its key configuration documented
- Every data flow must be traceable end-to-end
- Every error must have a defined propagation path
- Deployment must be reproducible from the doc alone
- Prefer concrete values over vague descriptions (e.g., "256 MB" not "sufficient memory")

**Still distinguish user decisions from your recommendations**
- When you recommend a value (e.g., "256 MB memory limit"), mark it as a recommendation and explain why
- When the user has specified something, state it as a requirement
- Use **[USER]** and **[REC]** tags inline when the distinction matters:
  - **[USER]** Python 3.x, no external frameworks
  - **[REC]** Memory limit: 256 MB (sufficient for API-call-only workload)

**Automated testing is a FIRST-CLASS deliverable — treat it with the same rigor as the architecture**
- The "Automated Testing Strategy" section must be as detailed and actionable as the architecture sections
- Every functional requirement and acceptance criterion from the source spec must map to at least one test
- Tests must be concrete: specify the exact input, expected output, and validation method — not vague descriptions
- Address non-determinism head-on: if the system involves LLMs or probabilistic outputs, the test strategy MUST explain how tests remain reliable
- Include the full test matrix — don't leave it to the implementer to figure out what to test
- Specify environment prerequisites so tests can be run by anyone with the right credentials
- If the source spec already defines test cases, incorporate them into the test matrix and expand coverage around them
- A technical design is NOT complete until the testing strategy is fully specified

**Ask, don't assume, for decisions that affect cost, performance, or correctness**
- Runtime versions, memory allocations, timeout values
- Region selection (affects service availability and latency)
- API design choices (REST vs GraphQL, sync vs async)
- Caching strategy (if applicable)

## Input

$ARGUMENTS
