export const meta = {
  name: 'run-review-flow',
  description: 'Spec/plan → plan review → implement in dependency waves → validate → code review → fix',
  whenToUse: 'Launched by the exec:run-flow command.',
  phases: [
    { title: 'Plan', detail: 'auto-plan spec (spec input only)' },
    { title: 'Parse', detail: 'deterministic parse via parse-plan.cjs (haiku ferries the ~1KB skeleton; model extraction only as fallback)' },
    { title: 'Plan review', detail: 'all-codex lens panel EVERY round; opus reviser; 2-round cap, final findings apply-and-proceed (no UNRESOLVED bail)' },
    { title: 'Execute', detail: 'dependency waves; parallel when Files are disjoint; 1 retry per task' },
    { title: 'Validate', detail: 'full-suite cross-task validation' },
    { title: 'Code review', detail: 'all-codex lens panel → triage gate (stale/unrealistic findings rejected) → fix loop while confirmed count shrinks; plateau after 2 fixes or 4 fix rounds stops (review-panel.md policy)' },
  ],
}

// ---------- input ----------
// args: { inputPath, inputType: 'plan'|'spec', decisions?: [{conflict, resolution}] }
// `decisions` is injected on resume after a NEEDS_DECISION stop; it changes the
// plan-review prompt, which busts the resume cache exactly there and nowhere earlier.
const _args = typeof args === 'string' ? JSON.parse(args) : (args ?? {})
const { inputPath, inputType, decisions = [] } = _args
// DETERMINED findings carried across a NEEDS_DECISION pause (returned by that stop,
// passed back verbatim on resume) — they go straight to the reviser instead of being
// re-derived by a fresh panel, which demonstrably loses findings.
const carriedFindings = Array.isArray(_args.carriedFindings) ? _args.carriedFindings : []
if (!inputPath || !['plan', 'spec'].includes(inputType)) {
  return { status: 'FAILED', stage: 'input', reason: `Invalid args: inputPath=${JSON.stringify(inputPath)}, inputType=${JSON.stringify(inputType)} — need inputPath plus inputType of 'plan' or 'spec'.` }
}
const specPath = inputType === 'spec' ? inputPath : null
// Task ids to force-rerun on resume: appends a note to ONLY these tasks' implementer
// prompts, busting their resume cache (and nothing earlier) so a task that failed on a
// now-resolved environmental blocker actually re-runs live. Downstream tasks that were
// never dispatched (loop broke at the failure) are fresh calls and run automatically.
const forceRerun = new Set(Array.isArray(_args.forceRerun) ? _args.forceRerun : [])
// Relaunch-after-manual-apply escape hatch (added 2026-07-24 after the playwright-e2e
// plan looped 3 full review cycles): a fresh launch resets round/applied state, so
// re-entering the panel after the orchestrator hand-applied UNRESOLVED findings just
// gives a fresh reviewer another chance to ratchet. Skip straight to Execute instead.
const skipPlanReview = _args.skipPlanReview === true

// ---------- schemas ----------
const PLANNER_OUT = {
  type: 'object', required: ['planPath'],
  properties: { planPath: { type: 'string' }, summary: { type: 'string' } },
}

// Skeleton only — what/tests/doneWhen deliberately absent: implementers read the full
// plan file themselves (by design), so ferrying those fields through a model costs
// thousands of output tokens for text the plan already holds verbatim. The workflow
// needs ids/titles (labels), files+dependsOn (wave/batch planning), and
// validationCommands (executed verbatim).
const PARSED = {
  type: 'object', required: ['tasks', 'validationCommands'],
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'title', 'files', 'dependsOn'],
        properties: {
          id: { type: 'string' }, title: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
          dependsOn: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    validationCommands: { type: 'array', items: { type: 'string' } },
  },
}

const PLAN_REVIEW_OUT = {
  type: 'object', required: ['verdict'],
  properties: {
    verdict: { enum: ['PASS', 'NEEDS_WORK'] },
    determined: { type: 'array', items: { type: 'string' } },
    needsDecision: {
      type: 'array',
      items: {
        type: 'object', required: ['conflict', 'options'],
        properties: { conflict: { type: 'string' }, options: { type: 'array', items: { type: 'string' } } },
      },
    },
    repeats: { type: 'array', items: { type: 'string' } },
    nits: { type: 'array', items: { type: 'string' } },
  },
}

const AGENT_RESULT = {
  type: 'object', required: ['status', 'summary'],
  properties: {
    status: { enum: ['SUCCESS', 'FAILURE'] },
    summary: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    testOutput: { type: 'string' },
    issues: { type: 'string' },
    discoveries: { type: 'array', items: { type: 'string' } },
  },
}

// Triage gate output: the reevaluator seat between panel and fixer (user decision
// 2026-07-25). The fixer must not judge severity — disputing its own workload is a
// conflict of interest — so a dedicated read-only seat re-verifies each finding
// against CURRENT code (kills stale reports: 8 of 9 findings false on wf_760d1b0d)
// and the realism floor (kills concrete-but-unreachable scenarios) before any fix
// round is paid for. Restores review-panel.md's verify-before-fix step the port dropped.
const TRIAGE_OUT = {
  type: 'object', required: ['confirmed', 'rejected'],
  properties: {
    confirmed: { type: 'array', items: { type: 'string' } },
    rejected: { type: 'array', items: { type: 'string' } },
  },
}

const CODE_REVIEW_OUT = {
  type: 'object', required: ['verdict'],
  properties: {
    verdict: { enum: ['PASS', 'NEEDS_WORK'] },
    blocking: { type: 'array', items: { type: 'string' } },
    nits: { type: 'array', items: { type: 'string' } },
  },
}

// Codex wrapper outputs: same shapes plus UNAVAILABLE — the merge drops an
// UNAVAILABLE panelist instead of failing the round. All reviewer seats are codex:
// a full codex CLI outage stops the review honestly (FAILED at plan review,
// UNRESOLVED at code review) rather than silently passing unreviewed work.
const withUnavailable = s => ({ ...s, properties: { ...s.properties, verdict: { enum: [...s.properties.verdict.enum, 'UNAVAILABLE'] } } })
const CODEX_PLAN_OUT = withUnavailable(PLAN_REVIEW_OUT)
const CODEX_CODE_OUT = withUnavailable(CODE_REVIEW_OUT)

// Model policy: opus = planner + plan-reviser. The reviser was upgraded to opus
// 2026-07-26: it holds the hardest job in the loop (a finding + its exact resolution
// mechanism + the live codebase + the whole plan's contract web, simultaneously), and
// every documented reviser-caused non-convergence (wf_ead81b27 mechanism substitution,
// wf_2677abe5 missed instance, wf_e87d6402 false claim) was the sonnet reviser. All
// reviewer seats (round-1 lens panels and round-2+ single re-reviewers, plan and code)
// are codex via haiku wrappers — opus reviews only in offline harness analysis/tuning
// sessions (/reflect, notes/harness-tuning-log.md), never inside this workflow.
// haiku = codex wrappers + parse ferry (runs parse-plan.cjs and copies its skeleton
// JSON; model extraction only as fallback when the script rejects the plan);
// sonnet = implementer/retry/validation/triage/code-fixer.
// ---------- shared prompt fragments ----------
const RESULT_NOTE = 'Run long commands in the FOREGROUND with an explicit timeout (e.g. `timeout 590 <cmd>`) — never `run_in_background`: ending your turn while waiting on a background command kills the task without a report. Return structured output: status (SUCCESS|FAILURE), summary (1-2 sentences), filesChanged (list), testOutput (pass/fail counts and the command), issues ("None" if none). Do NOT create git commits.'

// Execute-phase tasks each start a cold agent with no memory of what earlier tasks
// already learned — on plans with several tasks touching the same unfamiliar schema
// (DB tables, field-naming conventions, existing helpers), every task independently
// re-pays the same discovery cost (grepping, live DB queries, REPL probing). Carrying
// discoveries forward turns N re-derivations into 1 discovery + (N-1) free reads.
const DISCOVERY_ASK = 'Also return discoveries: reusable facts you had to dig for that a LATER task touching the same code/data would otherwise re-derive from scratch — real DB table/column names, field-naming conventions, existing helper functions/patterns, schema quirks. One fact per line, no task-specific narration. Empty list if nothing reusable turned up.'

// Gap-filling rule (2026-07-26, after the unsorted-picker/unreadable-font defects on
// wf_0405da73): implementers treated plan silence as "anything goes" and shipped the
// path of least resistance. This is the implementation-time mirror of the reviser's
// binding-resolution rule: where the plan speaks, apply it verbatim; where it is
// silent, use professional judgment — never lowest-effort defaults.
const GAP_FILL = `## Plan silence is not a specification
Where the plan doesn't state a detail, do not default to the path of least resistance — supply the choice a senior developer would consider self-evident, and prefer how the surrounding codebase already solves the same kind of problem over inventing your own. (Example of the class: a user-visible collection with no stated order gets an obviously sensible one, never storage order.) This is gap-filling, not scope expansion — note such choices in your summary. It never overrides anything the plan does state: where the plan speaks, the plan wins.`

const TEST_GATE = `## Test gate (scope it to THIS task — do NOT blindly run the whole suite)
- Run the task's own \`Tests:\` field verbatim. That field is the gate. If it names a scoped command, run exactly that.
- Otherwise pick the cheapest gate that actually covers your change:
  - Always: typecheck/compile or \`build\` (catches the same breakage a full unit run would, faster).
  - Logic change: run only IMPACTED tests — \`vitest related <changed-files>\` / \`vitest --changed\`, or the specific spec file(s) / Playwright spec. Never run the whole suite for one task.
  - Presentation/markup/config-only change (no business logic): build/typecheck + confirm any load-bearing selectors (\`data-testid\`, ids, form names) are preserved (grep them). Skip the full unit suite.
- The full suite runs in exactly two places: the baseline (first task) and final validation. Not per task.
- If a suite is gated on an external prerequisite that is currently down (e.g. a blocked network host, no DB), say so and do not count its pre-existing failures as yours. Do not escalate (no sudo) to chase env flakiness.
- **Backend (mocha) gates:** always pass \`--exit --timeout 0\` (or use the \`backend/package.json\` npm scripts, which all carry \`--exit\`). Bare \`npx mocha <file>\` HANGS after tests pass because the MSSQL pool keeps the event loop alive — a hang, not a failure.
- **Hard time wall — never grind on a slow gate.** Backend tests are fast: a single file and the full parallel suite both finish in ~1-2 min. Wrap EVERY backend gate in \`timeout 180\` (\`timeout 180 npx mocha --exit --timeout 0 <file>\`, \`timeout 180 npm test\`). If a gate hits its wall, it is a hang/env problem (VPN/DB down or a missing \`--exit\`), NOT a code bug: kill it (\`pkill -f mocha\`), check the DB socket (\`timeout 5 bash -c 'exec 3<>/dev/tcp/172.23.7.5/1433' && echo up || echo DOWN\`), and if it's env, report status FAILURE with issues explaining the blocker — do not keep re-running a hanging command.
- Whatever gate you run MUST pass (excluding the pre-existing env failures noted above). If it fails on your change, fix the code (not the tests).`

// Realism floor (2026-07-25 postmortem, admin-financial-override): codex can always
// construct a *concrete* failure scenario (interleaved requests, 2^53 precision,
// whitespace input) — the old floors filtered vagueness, not implausibility, and
// nothing downstream could push back on YAGNI grounds (2 fix rounds burned on a
// plan-mandated concurrency proof that still ended unresolved). The spec is the
// authority on rigor: every user decision was captured there; the run is autonomous.
const REALISM_RULE = `Realism floor: a blocking finding's failure scenario must be reachable by a realistic actor through the app's actual entry points — the UI as built or the documented API contract. Scenarios requiring inputs the UI cannot produce, concurrency the deployment does not actually exhibit, or data magnitudes outside the domain's real ranges are nits. Rigor machinery (locks, concurrency proofs, fault injection, extra precision handling) is warranted only where the spec/plan explicitly asks for it — an unrequested rigor upgrade is a nit, never blocking.`

// Coordination-channel severity floor (2026-07-26, wf_e87d6402): plan review's unique
// value is defects the parallel fresh-context implementers cannot self-correct — the
// plan is their only coordination channel. A defect confined to one task that its own
// implementer will directly collide with (broken SQL, an impossible gate, a factual
// claim the first compile/test disproves) self-heals via GAP_FILL; pricing it at a
// full gated round is the non-convergence engine (16→1→1 singleton rounds observed).
const PLAN_SEVERITY_RULE = `Severity floor — the plan is a coordination channel, not the implementation. Tasks are implemented in parallel by agents that share nothing but this plan, so report as blocking (DETERMINED/NEEDS_DECISION) only defects the implementers cannot self-correct: (a) cross-task incoherence — a contract one task produces and another consumes or asserts that does not line up (shapes, semantics, ownership, ordering), or (b) a defect that would ship silently — no test, gate, or validation step in the plan would surface it. A defect confined to ONE task that its implementer will directly collide with while doing the work (SQL that cannot run, a gate that cannot pass, a factual claim about the codebase disproved by the first compile or test run) is an advisory nit, never blocking — implementers are instructed to resolve exactly this class in place. Report such items as nits prefixed "ADVISORY(T{N}):" naming the affected task. Upgrades that merely make a test, gate, or audit more rigorous, exhaustive, or precise are also nits.`

// Round-1 panel: independent reviewers with distinct focus lenses. All existing
// seams are present from the start — a diverse panel catches in one round what a
// single reviewer peels off one per round.
const REVIEW_LENSES = [
  { key: 'cross-task', focus: "plan-review.md checks 1-2: unverified cross-task assertions and contradictory instructions for the same artifact. Trace every claim one task makes about another task's output back to an actual instruction in that task." },
  { key: 'contracts', focus: 'plan-review.md check 4 plus the Shared Contract: unowned cross-task invariants, error-code/status tables, shared types, formats and ordering rules. Verify every contract row is owned by exactly one task and consistently referenced by every task that touches it.' },
  { key: 'gates', focus: "plan-review.md checks 3 and 5: no-op/redundant tasks and unverifiable gates. A planned test that cannot actually be written or reached as specified (missing injection point, undefined fixture, unreachable failure path) makes its task's gate unverifiable — that is BLOCKING under check 5, not a nit." },
]

// ---------- prompt builders ----------
let planPath = inputPath

function plannerPrompt() {
  return `You are a planner. Input spec: ${inputPath}

1. Read the spec file in full. **Freshness guard:** if the spec is marked superseded/obsolete or names a successor spec that replaces it, do NOT plan — return planPath = "" and summary = "SUPERSEDED: {the marking, and the successor path if named}".
2. Classify it: **bug** (something broken, an error, a regression), **chore** (refactoring, cleanup, migration, maintenance), or **feature** (everything else — the default).
3. Read ~/.claude/commands/plan/{type}.md for the classified type and execute it exactly as written, treating the spec file content as its $ARGUMENTS.
4. Planning rule (non-convergence guard — 2 observed review-loop failures): a task must NOT bundle a behavior change with the design of its own test-verification machinery (fault-injection seams, cleanup/DB-restore contracts, baseline-capture procedures). Put that machinery in the Shared Contracts section — or a dedicated prerequisite task — so reviewers can check it once, coherently, instead of re-litigating it inside every task that touches it.
5. Return structured output with planPath = the plan file path you produced, and a one-line summary. Do NOT create git commits.`
}

const DECIDED_NOTE = decisions.length
  ? `\n## Resolved decisions from the user\nThese settle previously-raised NEEDS_DECISION conflicts. Treat them as spec-level intent: conflicts they resolve are now DETERMINED with the chosen resolution, never NEEDS_DECISION again.\n${JSON.stringify(decisions, null, 2)}\n`
  : ''

// Cross-model reviewers (decided 2026-07-23 after 4 evaluated runs — see
// notes/harness-tuning-log.md): codex holds ALL reviewer seats — the 3 lens seats
// in round 1 and the unscoped single re-reviewer in rounds 2+. Each wrapper agent
// only runs the CLI and transcribes its report — it reviews nothing itself.
const codexWrapperRules = (slug) => `Run codex from the repo root in ONE Bash call with timeout 600000: write the composed prompt to a temp file, then
   codex exec --sandbox read-only --ephemeral -o <tmpdir>/codex-review-${slug}.md - < <tmpdir>/codex-prompt-${slug}.md
The "-${slug}" filename suffix is MANDATORY — parallel panelists share the temp dir, and unsuffixed files get overwritten by the other reviewers mid-run.
Then read the output file and transcribe codex's findings VERBATIM into the structured output — do not re-judge, drop, merge, or add findings of your own.

If the codex CLI is missing, exits non-zero, produces no output file, or hits the timeout: return verdict UNAVAILABLE with all lists empty. Never invent a review, never retry more than once.`

function codexPlanReviewerPrompt(lens, round = 1, applied = [], knownNits = []) {
  const appliedNote = applied.length
    ? `\n## Resolutions already applied in earlier rounds — append this block verbatim to codex's prompt\nDo NOT re-report these — they are done. Report one prefixed "REPEAT:" ONLY if its required edit is demonstrably ABSENT from the plan — the fix was not applied at all. If the fix WAS applied but you would prefer it more rigorous, exhaustive, or precise, that is a nit, not a REPEAT and not blocking: re-litigating an applied fix with a stricter standard each round is exactly the non-convergence this check exists to stop. If an edit WAS made for the item but is defective, incomplete, or uses a different mechanism than the resolution required, report that defect as a NEW blocking-DETERMINED finding with its own exact resolution — NOT a REPEAT; REPEAT is reserved for items where no edit was attempted at all.\n${applied.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n`
    : ''
  const knownNitsNote = knownNits.length
    ? `\n## Nits already reported in earlier rounds — append this block verbatim to codex's prompt\nThese are known and non-blocking (the reviser applies the trivial ones). Do NOT re-report one, and do NOT escalate one to blocking unless you can state a concrete failure scenario the earlier round lacked — a known nit resurfacing as blocking costs a full extra review round.\n${knownNits.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n`
    : ''
  const role = lens
    ? `Add this lens line: "You are one of ${REVIEW_LENSES.length} parallel independent reviewers, each with a different focus. Run ALL of the checks, but dig deepest on YOUR lens — ${lens.key}: ${lens.focus} Report anything blocking you find regardless of lens." Also append this severity floor verbatim: "${PLAN_SEVERITY_RULE}" Also append this realism floor verbatim: "${REALISM_RULE}"`
    : `Tell codex it is the single round-${round} re-reviewer verifying a just-revised plan: run ALL of the checks unscoped in one coherent pass, and report EVERY finding it can see this round — each one held back costs a full extra review round. Also append this severity floor verbatim: "${PLAN_SEVERITY_RULE}" Also append this realism floor verbatim: "${REALISM_RULE}"`
  return `You are the thin wrapper for ${lens ? 'one of the cross-model Codex plan panelists' : 'the cross-model Codex plan re-reviewer'}. You do NOT review the plan yourself — codex is the reviewer; you only compose its prompt, run the CLI, and transcribe its report.

1. Read ~/.claude/commands/exec/plan-review.md in full.
2. Compose codex's prompt: plan-review.md's Step 1 reviewer prompt exactly, with {plan-file-path} = ${planPath} and {spec-file-path} = ${specPath ?? '(none — omit spec-specific instructions)'}.${DECIDED_NOTE ? ' Append the Resolved-decisions block below verbatim.' : ''} ${role} The composed prompt must be fully self-contained: paste the prompt text itself — never instruct codex to read files under ~/.claude.
3. ${codexWrapperRules(lens ? `plan-r${round}-${lens.key}` : `plan-r${round}`)}
${DECIDED_NOTE}${appliedNote}${knownNitsNote}
Structured output:
- verdict: PASS | NEEDS_WORK | UNAVAILABLE
- determined: list of strings, one per Blocking-DETERMINED finding from codex's report (the incoherence, which tasks conflict, the exact resolution)
- needsDecision: list of {conflict, options} from its Blocking-NEEDS_DECISION findings
- repeats: list of strings, one per "REPEAT:" finding from codex's report (empty otherwise)
- nits: list of strings`
}

function planReviserPrompt(determined, round, nits = []) {
  const nitsNote = nits.length
    ? `\n## Nits from the same review round (non-blocking — best-effort)\nApply a nit ONLY if it is a trivial local edit (wording fix, an exact threshold, removing a stale phrase). Skip any nit that would expand scope, add a new contract/task, or that you are unsure how to apply — list skipped nits in issues. Nits never justify restructuring.\n${nits.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n`
    : ''
  return `You are the plan-reviser subagent defined in ~/.claude/commands/exec/plan-review.md (its Step 2 reviser prompt). Revise round ${round}.

1. Read ~/.claude/commands/exec/plan-review.md in full and follow its Step 2 reviser instructions exactly, with {plan-file-path} = ${planPath}${specPath ? ` and {spec-file-path} = ${specPath}` : ' (no spec)'}.

## Findings to apply (each includes its exact resolution)
${determined.map((f, i) => `${i + 1}. ${f}`).join('\n')}
${nitsNote}
Findings may come from independent parallel reviewers and can overlap — where two findings describe the same incoherence, apply the fix once.

Each finding's RESOLUTION is binding: apply its stated mechanism as written — do NOT substitute a design you judge equivalent or simpler, even one grounded in the live codebase (a substituted mechanism reads as "fix absent" to the next reviewer and can abort the run). If the codebase or the plan makes a resolution genuinely wrong or impossible, apply nothing for that finding and report the conflict in issues instead.

Never write a NEW factual claim about the codebase into the plan (what a file or function does, an env var, a table/column, an existing pattern) without verifying it in the exact file you cite — read that file first and quote the verified line in your summary. If you cannot verify a claim a resolution seems to need, leave the claim out and note it in issues. (A plausible-but-wrong claim survives until a later review round disproves it, at a full round's cost — observed: a signing expression read in one file was attributed to a different file whose code hardcodes the value.)

Remember: edit the plan .md IN PLACE, preserve the parseable \`### T{N}: {title}\` structure and field names exactly, do not expand scope, do not touch code, no git commits.

Return structured output: status (SUCCESS|FAILURE), summary (what changed per finding), filesChanged, issues ("None" if none).`
}

// ---------- plan parse: deterministic script, model extraction only as fallback ----------
// The actual parsing lives in ~/.claude/workflows/parse-plan.cjs (single source of
// truth) — deterministic regex extraction against the pinned template structure
// (`### T{N}: {title}` + bold bullet fields, which the reviser is contractually bound
// to preserve), validated before printing. Workflow scripts have no filesystem access
// (probed 2026-07-26: no fs/require/process/fetch in the sandbox), so a haiku agent
// runs the script and copies its ~1KB skeleton JSON — it ferries the parser's output,
// it does not interpret the plan. The agent falls back to model extraction only when
// the script reports ok:false (non-conforming plan) or fails to run.
function validateParsed(p) {
  if (!p?.tasks?.length) return false
  const ids = new Set()
  for (const t of p.tasks) {
    if (!/^T\d+$/.test(t.id) || ids.has(t.id) || !t.title) return false
    ids.add(t.id)
  }
  return p.tasks.every(t => t.dependsOn.every(d => ids.has(d)))
}

async function parseTasks(round) {
  const parsed = await agent(`Run this exact command with the Bash tool (nothing else first):

node ~/.claude/workflows/parse-plan.cjs "${planPath}"

(Parse round ${round}.)

- If it prints {"ok":true,...}: return its \`tasks\` and \`validationCommands\` EXACTLY as printed — a verbatim copy, no edits, no re-derivation, no additions.
- ONLY if the command fails or prints {"ok":false,...}: read the plan at ${planPath} yourself and extract every task section with a heading like \`### T{N}: {title}\`. For each task return: id ("T{N}" exactly as in the heading), title, files (the Files field as individual full-repo-path entries; empty list if unclear), dependsOn (task ids like "T2" from the Depends on field; empty list for none/"-"). Also return validationCommands: the shell commands from the plan's Validation Commands section (empty list if none). Note the script's failure reason in your summary.`,
    { label: `parse plan (round ${round})`, model: 'haiku', effort: 'low', phase: 'Parse', schema: PARSED })
  if (validateParsed(parsed)) return parsed
  log(`Plan parse returned an invalid task skeleton (round ${round}) — retrying with direct model extraction`)
  return agent(`Read the plan file at ${planPath} in full. Parse round ${round}.

Extract every task section with a heading like \`### T{N}: {title}\`. For each task return:
- id: "T{N}" exactly as in the heading
- title
- files: the Files field split into individual full repo paths (empty list if unclear)
- dependsOn: the Depends on field as a list of task ids like "T2" (empty list for none/"-")

Also return validationCommands: the plan's final validation commands (from a Validation/Verification section), as a list of shell commands (empty list if none).`,
    { label: `parse tasks (round ${round})`, model: 'haiku', effort: 'low', phase: 'Parse', schema: PARSED })
}

function advisoryNote(taskId) {
  const mine = planAdvisories.filter(a => a.includes(`ADVISORY(${taskId})`))
  return mine.length
    ? `\n## Known plan inaccuracies affecting this task (plan-review advisories — the code is the authority)\nVerify each against the actual code and resolve it in place per the gap-fill rule below; say what you did in your summary.\n${mine.map((a, i) => `${i + 1}. ${a}`).join('\n')}\n`
    : ''
}

function discoveryNote(discoveries) {
  // Sorted copy: live runs collect discoveries in wave-COMPLETION order, which a
  // cache replay cannot reproduce — an order change here busts every later wave's
  // prompt cache on resume (observed: wf_d6d0d013 re-ran 5 completed tasks live).
  return discoveries.length
    ? `\n## Discoveries from earlier tasks (reuse these — do not re-derive)\n${[...discoveries].sort().map((d, i) => `${i + 1}. ${d}`).join('\n')}\n`
    : ''
}

function implementerPrompt(t, isFirst, hasParallelSiblings, discoveries) {
  const parallelNote = hasParallelSiblings
    ? '\n- Other tasks are running IN PARALLEL in this same working tree. Touch ONLY the files listed for this task. Never edit, revert, or "clean up" other files, and ignore unrelated concurrent changes you notice in git status.'
    : ''
  const baselineNote = isFirst
    ? '\n- This is the FIRST task of the run: before changing anything, run the full test suite once to record the baseline. Note pre-existing failures; never count them as yours.'
    : ''
  const rerunNote = forceRerun.has(t.id)
    ? `\n- RE-RUN (env blocker resolved). ${typeof _args.rerunNote === 'string' ? _args.rerunNote : 'A previous attempt failed on a now-resolved environmental blocker. Perform the work and verify the deliverable exists before reporting SUCCESS.'}`
    : ''
  return `Implement this task from the plan at ${planPath}:

## Task ${t.id}: ${t.title}
**Files:** ${t.files.join(', ') || '(see plan)'}
**What / Tests / Done when:** defined VERBATIM in the plan's \`### ${t.id}:\` section — that text is the authority on this task's scope, test gate, and acceptance criteria. If the Tests field is absent, pick the cheapest covering gate per the rules below.
${advisoryNote(t.id)}${discoveryNote(discoveries)}
## Context
- Read the full plan file FIRST — it defines your task (the \`### ${t.id}:\` section) and the overall context.
- Read CLAUDE.md to discover the test runner and project conventions.
- Implement the task: write code, write tests.${parallelNote}${baselineNote}${rerunNote}

${GAP_FILL}

${TEST_GATE}

${RESULT_NOTE} ${DISCOVERY_ASK}`
}

function diagnosticPrompt(t, previous, discoveries) {
  return `A task implementation failed. Fix it.

## Plan file: ${planPath}
## Failed task: ${t.id}: ${t.title}
## Previous attempt result:
${JSON.stringify(previous, null, 2)}
${advisoryNote(t.id)}${discoveryNote(discoveries)}
## Instructions
1. Read the plan for context.
2. Examine the current codebase — check files that were supposed to be created/modified.
3. Identify what went wrong and FIX it.
4. Run the task's scoped \`Tests:\` gate (impacted tests only, not the full suite) until it passes — under a hard time wall. Backend mocha must use \`--exit --timeout 0\` wrapped in \`timeout 120\`. A "test timeout / hang" that clears the wall is almost always the \`--exit\` bug or a downed DB/VPN, NOT a code defect — verify that hypothesis FIRST (retry once with \`--exit\`, check the DB socket) before treating it as a real failure. If it is env, report status FAILURE with issues explaining the blocker; do not re-run a hanging command repeatedly.

${GAP_FILL}

${RESULT_NOTE} ${DISCOVERY_ASK}`
}

function validationPrompt(validationCommands) {
  const cmds = validationCommands.length
    ? `Validation commands from the plan:\n${validationCommands.map(c => `- ${c}`).join('\n')}`
    : 'The plan lists no explicit validation commands: read the plan and CLAUDE.md and run the project full test suite / build.'
  return `Run final cross-task validation for the plan at ${planPath}. All tasks are implemented; catch cross-task regressions.

${cmds}

This is the ONE full-suite run after baseline. Wrap backend mocha in \`timeout 180\` with \`--exit --timeout 0\`. Run every command in the FOREGROUND — never \`run_in_background\` (ending your turn while waiting on a background command kills the task without a report). Skip suites whose external prerequisite is confirmed down and note them; report pre-existing env failures separately from genuine regressions.

Gates beyond the commands:
- **Skipped ≠ pass.** A test that covers a plan acceptance criterion but is SKIPPED or not run (missing fixture, env var, login state) is a FAILURE of that criterion, not a pass — name the criterion in issues. A green suite that never executed the acceptance test proves nothing.
- **Runtime Verification.** If the plan has a Runtime Verification section, execute every step live with the playwright-cli skill against the running app: open the route, assert the element/behavior actually renders, perform the action, verify the observable outcome. Report each step's observed result in testOutput. A step you could not execute is a FAILURE with the blocker named. Static checks (build/tsc) never substitute for a runtime step — framework wiring (DI, routing, template rendering) fails invisibly to the compiler.

Return structured output: status SUCCESS only if there are no genuine regressions AND no acceptance criterion is covered only by a skipped/unexecuted test AND every Runtime Verification step passed (env-blocked suites noted in issues do not fail the run), summary, testOutput, issues. Do NOT create git commits.`
}

// Lens keys must match the table in review-panel.md — definitions live there only.
const CODE_LENSES = ['correctness', 'resilience', 'tests']

function codexCodeReviewerPrompt(lens, round = 1, applied = [], disputed = []) {
  // applied (prior fix rounds) + disputed (triage-gate rejections) close the fix-loop
  // blind spot from the 2026-07-25 postmortem: r1 found the missing Edit-button wiring,
  // the fixer wired the WRONG component (tsc-verified), and r2 — reviewing the diff
  // cold — never noticed the fix missed the finding's scenario. Detection was fine;
  // the loop dropped the thread.
  const appliedNote = applied.length
    ? `\n## Fixes applied in earlier rounds — append this block verbatim to codex's prompt\nFor EACH finding below, verify the fix actually lies on the code path the finding's scenario exercises: read the fix, then trace the scenario's entry point (route config → the component the route really renders → its template/inheritance chain; or caller → callee) and confirm it reaches the changed code. A fix that compiles but sits on a different component/route/path than the scenario described is NOT fixed — re-report it as blocking prefixed "UNFIXED:". If the fix does address the scenario, do not re-litigate it for rigor.\n${applied.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n`
    : ''
  const disputedNote = disputed.length
    ? `\n## Findings the triage gate REJECTED as stale, duplicate, or unrealistic — append this block verbatim to codex's prompt\nEach carries the gate's classification and rationale. Re-report one as blocking ONLY if you can state a concrete trigger path through the app's real entry points that refutes the rationale; otherwise do not re-report it.\n${disputed.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n`
    : ''
  const role = lens
    ? `Add a lens line: codex is one of ${CODE_LENSES.length} parallel independent reviewers of the same diff and must run ALL the angles but dig deepest on the \`${lens}\` lens — copy that lens's full definition from review-panel.md's Lenses table into codex's prompt (codex cannot read ~/.claude), and tell it to report every blocking finding it sees regardless of lens. Also append this realism floor verbatim: "${REALISM_RULE}"`
    : `Tell codex it is the single round-${round} re-reviewer verifying the diff after a fix round: run ALL the lens angles — copy every lens definition from review-panel.md's Lenses table into codex's prompt (codex cannot read ~/.claude) — in one coherent pass. Also append this severity floor verbatim: "Severity floor for this re-review round: report as blocking ONLY defects with a concrete failure scenario — a specific input or state under which the code produces wrong results, crashes, or a test passes/fails falsely. Changes that merely make a test, wait, or check more rigorous, exhaustive, or precise without such a scenario are nits." Also append this realism floor verbatim: "${REALISM_RULE}"`
  return `You are the thin wrapper for ${lens ? 'one of the cross-model Codex code panelists' : 'the cross-model Codex code re-reviewer'} (wrapper contract: ~/.claude/commands/exec/review-panel.md, "The Codex panelist" section). You do NOT review any code yourself — codex is the reviewer; you only compose its prompt, run the CLI, and transcribe its report.

1. Read ~/.claude/commands/exec/review-panel.md and ~/.claude/commands/exec/review-loop.md in full.
2. Compose codex's prompt: review-loop.md's Step 1 reviewer prompt with {plan-file-path} = ${planPath} and no spec (omit spec-specific instructions). ${role} Tell codex to report in review-loop.md's exact "### Review" format. The composed prompt must be fully self-contained: paste the Step 1 reviewer prompt text and lens definitions themselves — never instruct codex to read files under ~/.claude.
3. ${codexWrapperRules(lens ? `code-r${round}-${lens}` : `code-r${round}`)}
${appliedNote}${disputedNote}
Structured output:
- verdict: PASS | NEEDS_WORK | UNAVAILABLE
- blocking: list of strings, one per blocking finding from codex's report — "file:line — what's wrong — the input/scenario that triggers it — expected fix"
- nits: list of strings`
}

function triagePrompt(blocking, round) {
  return `You are the finding-triage gate between the code-review panel and the fixer, round ${round}. Independent parallel reviewers produced the blocking findings below. Before any fix work is dispatched, re-evaluate each one against the CURRENT code and the plan: reviewers sometimes report from stale expectations (a change already applied) or construct concrete-but-unreachable scenarios, and a wasted fix round costs far more than this check.

Plan (scope and acceptance authority): ${planPath}${specPath ? `\nSpec (intent authority): ${specPath}` : ''}

## Findings
${blocking.map((f, i) => `${i + 1}. ${f}`).join('\n')}

For EACH finding, read the current code at its location — plus enough surrounding context to judge it (callers, route config, the component a route actually renders, templates/inheritance) — and classify:
- **CONFIRMED**: the defect is present in the current code AND its failure scenario is reachable by a realistic actor through the app's actual entry points (the UI as built, the documented API contract).
- **STALE**: the claimed defect is not present in the current code (already fixed, or the reviewer misread) — cite file:line evidence.
- **UNREALISTIC**: technically constructible but the scenario requires inputs the UI cannot produce, concurrency the deployment does not exhibit, or data magnitudes outside the domain's real ranges — or it mandates rigor machinery (locks, concurrency proofs, fault injection, precision handling) the spec/plan never asked for. One-line rationale grounded in the spec/plan or the code.
- **DUPLICATE**: same defect as another finding — confirm one, mark the rest duplicates of it.

Judge severity, never difficulty: a hard-to-fix real defect is CONFIRMED. When genuinely uncertain whether a defect is real, CONFIRM it — the fixer's own verification is the next check; this gate exists to kill clear noise, not to shave real work. You are read-only: modify no files, no git commits.

Return structured output:
- confirmed: the findings to fix, verbatim (empty if none survive)
- rejected: one string per STALE/UNREALISTIC/DUPLICATE finding — "{the finding} — {CLASSIFICATION} — {rationale/evidence}"`
}

function fixerPrompt(blocking, round) {
  return `You are the fixer subagent defined in ~/.claude/commands/exec/review-loop.md (its Step 2 fixer prompt). Fix round ${round}.

1. Read ~/.claude/commands/exec/review-loop.md in full and follow its Step 2 fixer instructions exactly, with {plan-file-path} = ${planPath} and no spec.

## Blocking findings
${blocking.map((f, i) => `${i + 1}. ${f}`).join('\n')}

Every finding above already passed a triage gate that verified it against the current code and a realism floor — Step 2's "dispute" option is NOT available here: fix every finding. Findings can still overlap — where two describe the same defect, fix it once. Do not address nits. No git commits.

What you verify is the finding's FAILURE SCENARIO, not your edit. Logic findings: typecheck/build the touched files and run the single covering test (write one if the finding was a missing/weak test). Rendering/wiring/reachability findings (element not rendered, provider not injected, route never reaches the code): typecheck/build is NOT sufficient — trace the actual chain (route config → the component the route REALLY renders → its template/inheritance chain), cite file:line for every hop, and confirm your fix lies ON that chain. If the finding names a component, verify it is the one the route renders BEFORE fixing it; if it is not, fix the one that is and say so in summary. If a fix genuinely cannot be verified without running the app, state exactly what runtime evidence is missing in issues — never claim it fixed on a compile alone.

Return structured output: status (SUCCESS|FAILURE), summary (what was fixed per finding, including the reachability trace for wiring fixes), filesChanged, testOutput (the specific verification you ran), issues ("None" if none).`
}

// ---------- graph helpers (plain JS — deterministic, no agent involved) ----------
function computeWaves(tasks) {
  const byId = new Map(tasks.map(t => [t.id, t]))
  const depth = new Map()
  const visiting = new Set()
  function d(t) {
    if (depth.has(t.id)) return depth.get(t.id)
    if (visiting.has(t.id)) throw new Error(`Dependency cycle involving ${t.id}`)
    visiting.add(t.id)
    const deps = t.dependsOn.filter(id => byId.has(id))
    const val = deps.length ? 1 + Math.max(...deps.map(id => d(byId.get(id)))) : 0
    visiting.delete(t.id)
    depth.set(t.id, val)
    return val
  }
  tasks.forEach(d)
  const waves = []
  for (const t of tasks) {
    const i = depth.get(t.id)
    ;(waves[i] ??= []).push(t)
  }
  return waves
}

// Within a wave, tasks run in parallel ONLY when their declared Files are pairwise
// disjoint (shared working tree, no worktrees needed). A task with no Files listed
// is treated as potentially conflicting and runs alone.
function planBatches(wave) {
  const batches = []
  for (const t of wave) {
    const files = (t.files ?? []).map(f => f.trim()).filter(Boolean)
    let placed = false
    if (files.length) {
      for (const b of batches) {
        if (b.files && !files.some(f => b.files.has(f))) {
          b.tasks.push(t)
          files.forEach(f => b.files.add(f))
          placed = true
          break
        }
      }
    }
    if (!placed) batches.push({ tasks: [t], files: files.length ? new Set(files) : null })
  }
  return batches
}

// ---------- Phase: Plan ----------
phase('Plan')
let autoPlanned = false
if (inputType === 'spec') {
  autoPlanned = true
  const p = await agent(plannerPrompt(), { label: 'planner', model: 'claude-opus-4-8', effort: 'high', phase: 'Plan', schema: PLANNER_OUT })
  if (!p?.planPath) return { status: 'FAILED', stage: 'plan', reason: p?.summary || 'Planner did not produce a plan file.' }
  planPath = p.planPath
  log(`Plan created: ${planPath}`)
} else {
  log(`Plan input: ${planPath} — skipping auto-plan`)
}

// ---------- Phase: Parse ----------
phase('Parse')
let parsed = await parseTasks(1)
if (!parsed?.tasks?.length) return { status: 'FAILED', stage: 'parse', planPath, reason: 'No tasks parsed from the plan.' }
log(`Found ${parsed.tasks.length} tasks to execute`)

// ---------- Phase: Plan review (gated) ----------
// EVERY round is a parallel lens panel (2026-07-26, wf_309ff903): a single re-reviewer
// surfaces ~1 new genuine defect per round, so a dense contract web dribbled out over
// 4-5 rounds even with an opus reviser applying clean fixes — the loop was
// reviewer-driven, not reviser-driven. Panelling every round exhausts the defect pool
// in one pass, which is what lets the cap drop to 2: r1 panel → revise → r2 panel →
// (revise) → Execute. At the 2-round cap, determined findings are applied ONE final
// time and the run PROCEEDS (no UNRESOLVED bail) — surfaced as planFinalUnverified;
// this ends the orchestrator hand-off / round-budget-reset meta-loop, with code review
// as the downstream net for any ripple. A REPEAT (required fix demonstrably absent) is
// the exception that still bails: it means fixes aren't landing, so proceeding is
// unsafe — one verbatim-apply grace round, then UNRESOLVED. Hard backstop: 2 rounds.
phase('Plan review')
let planReview = skipPlanReview
  ? 'SKIPPED (skipPlanReview — findings applied manually after an UNRESOLVED_PLAN stop)'
  : `SKIPPED (hand-written plan with ${parsed.tasks.length} tasks)`
let planNits = []
// ADVISORY(T{N})-prefixed nits from any plan-review round: single-task defects the
// implementer will collide with and can resolve in place (see PLAN_SEVERITY_RULE).
// They ride into that task's implementer prompt for free instead of costing a gated
// revise round. Populated after the loop from every round's nits.
let planAdvisories = []
// Determined findings applied at the 2-round cap without a further re-gating panel
// (option A, 2026-07-26): reported so the orchestrator/user knows exactly what shipped
// unverified into Execute. Code review is the downstream net.
let planFinalUnverified = []
if (!skipPlanReview && (autoPlanned || parsed.tasks.length > 2)) {
  const MAX_REVIEW_ROUNDS = 2
  const applied = []
  const knownNits = [] // every nit seen so far — re-reviewers get them as known/non-escalatable (a nit re-found as blocking cost a full round on wf_f72ce22c)
  let repeatGraceUsed = false
  let revised = 0
  let round = 1
  // Resumed after a NEEDS_DECISION pause: send the human's decisions plus the paused
  // round's carried DETERMINED findings straight to the reviser instead of re-running
  // the panel — a fresh panel re-derives only part of what the paused panel found and
  // spends most of its tokens restating the chosen resolutions once per panelist. The
  // round-2 panel then verifies the revised plan; round 2 is the cap, so on resume that
  // panel is the final gate (its findings apply-and-proceed, no further re-review).
  if (decisions.length) {
    // Restore the paused loop's context: without these, a mid-loop NEEDS_DECISION
    // pause resumes with empty applied[]/knownNits and the re-reviewer re-litigates
    // already-applied resolutions. Passed back verbatim from the NEEDS_DECISION result.
    if (Array.isArray(_args.appliedResolutions)) applied.push(..._args.appliedResolutions)
    if (Array.isArray(_args.knownNits)) knownNits.push(..._args.knownNits)
    const seeded = [
      ...decisions.map(d => `USER DECISION — conflict: ${d.conflict} RESOLUTION to apply: ${d.resolution} Apply this resolution everywhere the plan touches the conflict (task What/Tests/Done-when fields, Shared Contract rows, acceptance criteria). If the plan already reflects it, make no edit for this item.`),
      ...carriedFindings,
    ]
    log(`Resuming with ${decisions.length} decision(s) + ${carriedFindings.length} carried finding(s) — reviser-first, then a final verification panel`)
    const rev = await agent(planReviserPrompt(seeded, revised + 1), { label: `plan revise r${revised + 1}`, model: 'claude-opus-4-8', phase: 'Plan review', schema: AGENT_RESULT })
    if (rev?.status !== 'SUCCESS') {
      return { status: 'UNRESOLVED_PLAN', planPath, planReview: 'UNRESOLVED', findings: seeded, reason: 'Reviser failed while applying user decisions + carried findings.', nits: planNits }
    }
    applied.push(...seeded)
    revised++
    parsed = await parseTasks(revised + 1)
    if (!parsed?.tasks?.length) return { status: 'FAILED', stage: 'parse', planPath, reason: 'Re-parse after decision revision found no tasks.' }
    round = 2 // the panel already ran before the pause — resume at the cap: one verification panel, then proceed
  }
  for (; ; round++) {
    // Panel every round (not just r1): parallel lens seats each get the applied[] +
    // knownNits context in r≥2 so they don't re-litigate fixed work. An exhaustive
    // panel each round is what makes the 2-round cap safe.
    const raw = await parallel(REVIEW_LENSES.map(l => () =>
      agent(codexPlanReviewerPrompt(l, round, applied, knownNits), { label: `plan review r${round}:codex:${l.key}`, model: 'haiku', phase: 'Plan review', schema: CODEX_PLAN_OUT })))
    const panel = raw.filter(p => p && p.verdict !== 'UNAVAILABLE')
    log(`plan review r${round}: codex lens panelists up: ${panel.length}/${REVIEW_LENSES.length}`)
    if (!panel.length) {
      const outage = raw.some(p => p?.verdict === 'UNAVAILABLE')
      return { status: 'FAILED', stage: 'plan-review', planPath, reason: outage ? `Codex CLI unavailable at plan-review round ${round} — all lens panelists returned UNAVAILABLE; plan not reviewed. Resume when codex is back.` : 'All panel reviewers died.' }
    }
    const r = {
      verdict: panel.some(p => p.verdict === 'NEEDS_WORK') ? 'NEEDS_WORK' : 'PASS',
      determined: panel.flatMap(p => p.determined ?? []),
      needsDecision: panel.flatMap(p => p.needsDecision ?? []),
      repeats: panel.flatMap(p => p.repeats ?? []),
      nits: panel.flatMap(p => p.nits ?? []),
    }
    // Wrappers sometimes leave codex's "REPEAT:" prefix inside determined (seen on
    // wf_744f8f49) — reclassify by prefix so a repeat stops the loop instead of
    // triggering another revise round.
    const misfiled = (r.determined ?? []).filter(f => /^\s*REPEAT:/i.test(f))
    if (misfiled.length) {
      r.repeats = [...(r.repeats ?? []), ...misfiled]
      r.determined = (r.determined ?? []).filter(f => !/^\s*REPEAT:/i.test(f))
    }
    planNits = r.nits ?? []
    knownNits.push(...planNits)
    if (r.needsDecision?.length) {
      // All-or-nothing: apply no DETERMINED fixes; the human decides first, then we
      // resume with `decisions` in args and re-review in one coherent pass.
      // Return the DETERMINED findings too — the entry point passes them back as
      // args.carriedFindings on resume so this round's work is not thrown away.
      // appliedResolutions + knownNits: the loop's context, returned so a resume can
      // restore it (2026-07-26, wf_e87d6402: a round-3 pause wiped 17 applied
      // resolutions from the re-reviewer's context — it can then re-litigate finished
      // work as new findings and re-escalate known nits).
      return { status: 'NEEDS_DECISION', planPath, planReview: 'NEEDS_DECISION', needsDecision: r.needsDecision, determined: r.determined ?? [], appliedResolutions: applied, knownNits, nits: planNits }
    }
    if (r.repeats?.length) {
      // Grace round (2026-07-26): a first repeat goes back to the reviser as a
      // verbatim-apply instruction (any determined findings from the same round ride
      // along so they aren't lost). Only a repeat that survives its own targeted
      // round — or one landing at the backstop — aborts.
      if (repeatGraceUsed || round >= MAX_REVIEW_ROUNDS) {
        return { status: 'UNRESOLVED_PLAN', planPath, planReview: 'UNRESOLVED', findings: r.repeats, reason: repeatGraceUsed ? 'Repeats survived their targeted verbatim-apply grace round — non-converging plan defect. Re-plan or split rather than revising again.' : `Repeat reported at the ${MAX_REVIEW_ROUNDS}-round backstop — no room for a grace round. Re-plan or split rather than revising again.`, nits: planNits }
      }
      repeatGraceUsed = true
      const graceFindings = [
        ...r.repeats.map(f => `PREVIOUSLY REQUIRED, STILL ABSENT — apply this RESOLUTION verbatim, mechanism included; delete any earlier edit that contradicts it: ${f}`),
        ...(r.determined ?? []),
      ]
      log(`Plan review round ${round}: ${r.repeats.length} repeat(s) — one grace revise round, resolutions apply verbatim`)
      const rev = await agent(planReviserPrompt(graceFindings, revised + 1, planNits), { label: `plan revise r${revised + 1} (repeat grace)`, model: 'claude-opus-4-8', phase: 'Plan review', schema: AGENT_RESULT })
      if (rev?.status !== 'SUCCESS') {
        return { status: 'UNRESOLVED_PLAN', planPath, planReview: 'UNRESOLVED', findings: r.repeats, reason: 'Reviser failed during the repeat grace round.', nits: planNits }
      }
      applied.push(...graceFindings)
      revised++
      parsed = await parseTasks(revised + 1)
      if (!parsed?.tasks?.length) return { status: 'FAILED', stage: 'parse', planPath, reason: 'Re-parse after grace revision found no tasks.' }
      continue
    }
    const det = r.determined ?? []
    if (r.verdict === 'PASS' || det.length === 0) {
      planReview = revised ? `PASS (after ${revised} revise rounds)` : 'PASS'
      break
    }
    const isFinal = round >= MAX_REVIEW_ROUNDS
    log(`Plan review round ${round}: ${det.length} determined finding(s) — spawning reviser${isFinal ? ' (final apply at cap, not re-gated)' : ''}`)
    const rev = await agent(planReviserPrompt(det, revised + 1, planNits), { label: `plan revise r${revised + 1}${isFinal ? ' (final, not re-gated)' : ''}`, model: 'claude-opus-4-8', phase: 'Plan review', schema: AGENT_RESULT })
    if (rev?.status !== 'SUCCESS') {
      return { status: 'UNRESOLVED_PLAN', planPath, planReview: 'UNRESOLVED', findings: det, reason: 'Reviser failed.', nits: planNits }
    }
    applied.push(...det)
    revised++
    parsed = await parseTasks(revised + 1) // reviser edited the plan — re-parse before executing
    if (!parsed?.tasks?.length) return { status: 'FAILED', stage: 'parse', planPath, reason: 'Re-parse after revision found no tasks.' }
    if (isFinal) {
      // 2-round cap reached with findings still appearing: the reviser has just applied
      // them, but no further panel verifies that apply. Proceed to Execute rather than
      // bailing to UNRESOLVED — the bail re-triggered the orchestrator hand-off and reset
      // the round budget (wf_309ff903 ran past the old 4-round backstop). Code review is
      // the net for any unverified ripple.
      planFinalUnverified = det
      planReview = `PASS (${det.length} finding(s) applied at the ${MAX_REVIEW_ROUNDS}-round cap, NOT re-gated; after ${revised} revise rounds)`
      log(`Plan review cap: applied ${det.length} final finding(s) unverified and proceeding to Execute`)
      break
    }
  }
  planAdvisories = knownNits.filter(n => /ADVISORY\(T[^)]+\)/i.test(n))
  if (planAdvisories.length) log(`${planAdvisories.length} advisory finding(s) will ride into their tasks' implementer prompts`)
} else {
  log(`Plan review: ${planReview}`)
}

// ---------- Phase: Execute ----------
phase('Execute')
let waves
try {
  waves = computeWaves(parsed.tasks)
} catch (e) {
  return { status: 'FAILED', stage: 'parse', planPath, reason: e.message }
}

const results = {}
let execFailed = false
let first = true
// Reusable facts tasks dig up (DB schema, naming conventions, helpers) — carried
// forward wave to wave so later tasks read them instead of re-deriving them. Tasks
// in the same parallel batch each see the snapshot as of batch start (they can't see
// each other's mid-flight discoveries, but every later wave sees everything so far).
const discoveries = []

async function runTask(t, hasParallelSiblings) {
  const isFirst = first
  first = false
  const attempt = await agent(implementerPrompt(t, isFirst, hasParallelSiblings, discoveries), { label: `${t.id}: ${t.title}`, model: 'sonnet', phase: 'Execute', schema: AGENT_RESULT })
  if (attempt?.status === 'SUCCESS') {
    if (Array.isArray(attempt.discoveries)) discoveries.push(...attempt.discoveries)
    return { ...attempt, retried: false }
  }
  log(`${t.id} failed — spawning diagnostic retry`)
  const retry = await agent(diagnosticPrompt(t, attempt ?? { status: 'FAILURE', summary: 'Implementer agent died with no report.' }, discoveries), { label: `${t.id}: retry`, model: 'sonnet', phase: 'Execute', schema: AGENT_RESULT })
  if (Array.isArray(retry?.discoveries)) discoveries.push(...retry.discoveries)
  return retry ? { ...retry, retried: true } : { status: 'FAILURE', summary: 'Diagnostic agent died.', retried: true }
}

outer:
for (const wave of waves) {
  for (const batch of planBatches(wave)) {
    const ids = batch.tasks.map(t => t.id).join(', ')
    log(batch.tasks.length > 1 ? `Running in parallel (disjoint files): ${ids}` : `Running: ${ids}`)
    const out = await parallel(batch.tasks.map(t => () => runTask(t, batch.tasks.length > 1)))
    batch.tasks.forEach((t, i) => { results[t.id] = out[i] ?? { status: 'FAILURE', summary: 'Agent died.' } })
    for (const t of batch.tasks) {
      log(`${t.id}: ${t.title} — ${results[t.id].status === 'SUCCESS' ? `COMPLETED${results[t.id].retried ? ' (after retry)' : ''}` : 'FAILED after retry'}`)
    }
    if (batch.tasks.some(t => results[t.id].status !== 'SUCCESS')) { execFailed = true; break outer }
  }
}
for (const t of parsed.tasks) if (!results[t.id]) results[t.id] = { status: 'SKIPPED', summary: 'Skipped: an earlier task failed.' }

const taskSummary = parsed.tasks.map(t => ({
  id: t.id, title: t.title,
  result: results[t.id].status === 'SUCCESS' ? (results[t.id].retried ? 'COMPLETED (after retry)' : 'COMPLETED') : results[t.id].status,
  summary: results[t.id].summary,
}))
const completed = taskSummary.filter(t => t.result.startsWith('COMPLETED')).length

// ---------- Phase: Validate ----------
phase('Validate')
let validation = 'NOT RUN'
let validationIssues = null
if (!execFailed) {
  const v = await agent(validationPrompt(parsed.validationCommands ?? []), { label: 'final validation', model: 'sonnet', phase: 'Validate', schema: AGENT_RESULT })
  validation = v?.status === 'SUCCESS' ? 'PASS' : 'FAIL'
  validationIssues = v?.issues ?? v?.summary ?? 'Validation agent died.'
}

// ---------- Phase: Code review ----------
phase('Code review')
let review = 'NOT RUN'
let reviewNits = []
let unresolvedFindings = []
let triageRejected = []
if (!execFailed && validation === 'PASS') {
  let fixed = 0
  let prevBlocking = Infinity
  const appliedFixes = [] // per fix round: findings given to the fixer + its own account — r≥2 verifies each fix against its finding's scenario
  for (let round = 1; ; round++) {
    let r
    if (round === 1) {
      // Wide first sweep: 3 codex lens panelists in parallel. Later rounds verify
      // fixes — one unscoped codex reviewer is the right check there.
      const raw = await parallel(CODE_LENSES.map(l => () =>
        agent(codexCodeReviewerPrompt(l), { label: `code review r1:codex:${l}`, model: 'haiku', phase: 'Code review', schema: CODEX_CODE_OUT })))
      const panel = raw.filter(p => p && p.verdict !== 'UNAVAILABLE')
      log(`codex lens panelists up: ${panel.length}/${CODE_LENSES.length}`)
      if (!panel.length) {
        const outage = raw.some(p => p?.verdict === 'UNAVAILABLE')
        review = 'UNRESOLVED'
        unresolvedFindings = [outage ? 'Codex CLI unavailable — all lens panelists returned UNAVAILABLE; code NOT reviewed.' : 'All panel reviewers died.']
        break
      }
      r = {
        verdict: panel.some(p => p.verdict === 'NEEDS_WORK') ? 'NEEDS_WORK' : 'PASS',
        blocking: panel.flatMap(p => p.blocking ?? []),
        nits: panel.flatMap(p => p.nits ?? []),
      }
    } else {
      r = await agent(codexCodeReviewerPrompt(null, round, appliedFixes, triageRejected), { label: `code review r${round}:codex`, model: 'haiku', phase: 'Code review', schema: CODEX_CODE_OUT })
      if (!r) { review = 'UNRESOLVED'; unresolvedFindings = ['Reviewer agent died.']; break }
      if (r.verdict === 'UNAVAILABLE') { review = 'UNRESOLVED'; unresolvedFindings = [`Codex CLI unavailable at code-review round ${round} — fixes not re-verified.`]; break }
    }
    reviewNits = r.nits ?? []
    if (r.verdict === 'PASS') {
      review = fixed ? `PASS (panel, after ${fixed} fix rounds)` : 'PASS (panel)'
      break
    }
    // Triage gate (reevaluator seat, user decision 2026-07-25): re-verify each
    // blocking finding against the current code + the realism floor BEFORE paying
    // for a fix round. Convergence/plateau checks run on the CONFIRMED count — raw
    // panel counts include exactly the noise this gate removes. If the triage agent
    // dies, fail open: fix everything rather than silently drop findings.
    let blocking = r.blocking ?? []
    if (blocking.length) {
      const t = await agent(triagePrompt(blocking, round), { label: `triage r${round}`, model: 'sonnet', phase: 'Code review', schema: TRIAGE_OUT })
      if (t) {
        triageRejected.push(...(t.rejected ?? []))
        blocking = t.confirmed ?? []
        log(`triage r${round}: ${blocking.length} confirmed, ${(t.rejected ?? []).length} rejected`)
      }
    }
    if (!blocking.length) {
      review = fixed ? `PASS (panel; round-${round} findings all triaged out, after ${fixed} fix rounds)` : `PASS (panel; round-${round} findings all triaged out)`
      break
    }
    // Convergence-aware stop (2026-07-24, wf_11c56662): the old hard 2-fix cap bailed
    // with 1 small finding left while the loop was converging 9 → 3 → 1 blocking. Keep
    // fixing while the blocking count strictly shrinks; a plateau or rise after 2 fixes
    // is the fix-introduces-new-bug ping-pong signature and stops honestly. Absolute
    // backstop: 4 fix rounds no matter the trajectory.
    if ((fixed >= 2 && blocking.length >= prevBlocking) || fixed >= 4) {
      review = 'UNRESOLVED'; unresolvedFindings = blocking; break
    }
    prevBlocking = blocking.length
    const fix = await agent(fixerPrompt(blocking, fixed + 1), { label: `fix r${fixed + 1}`, model: 'sonnet', phase: 'Code review', schema: AGENT_RESULT })
    if (fix?.status !== 'SUCCESS') { review = 'UNRESOLVED'; unresolvedFindings = blocking; break }
    appliedFixes.push(`Fix round ${fixed + 1} — findings addressed:\n${blocking.map((b, i) => `  ${i + 1}. ${b}`).join('\n')}\nFixer's account: ${fix.summary}`)
    fixed++
  }
}

// ---------- Result ----------
return {
  status: execFailed ? 'PARTIAL' : validation === 'FAIL' ? 'VALIDATION_FAILED' : 'COMPLETE',
  planPath,
  planReview,
  tasks: taskSummary,
  completed,
  total: parsed.tasks.length,
  validation,
  validationIssues,
  review,
  unresolvedFindings,
  triageRejected,
  nits: reviewNits,
  planNits,
  planAdvisories,
  planFinalUnverified,
}
