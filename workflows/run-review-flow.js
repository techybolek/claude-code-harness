export const meta = {
  name: 'run-review-flow',
  description: 'Spec/plan → plan review → implement in dependency waves → validate → code review → fix',
  whenToUse: 'Launched by the exec:run-flow command. Deterministic Workflow port of exec:run-review.',
  phases: [
    { title: 'Plan', detail: 'auto-plan spec (spec input only)' },
    { title: 'Parse', detail: 'extract tasks from the plan' },
    { title: 'Plan review', detail: 'lens panel round 1, then loop-until-dry; max 4 rounds (plan-review.md policy)' },
    { title: 'Execute', detail: 'dependency waves; parallel when Files are disjoint; 1 retry per task' },
    { title: 'Validate', detail: 'full-suite cross-task validation' },
    { title: 'Code review', detail: 'lens panel round 1 → fix loop, max 2 rounds (review-panel.md policy)' },
  ],
}

// ---------- input ----------
// args: { inputPath, inputType: 'plan'|'spec', decisions?: [{conflict, resolution}] }
// `decisions` is injected on resume after a NEEDS_DECISION stop; it changes the
// plan-review prompt, which busts the resume cache exactly there and nowhere earlier.
const _args = typeof args === 'string' ? JSON.parse(args) : (args ?? {})
const { inputPath, inputType, decisions = [] } = _args
if (!inputPath || !['plan', 'spec'].includes(inputType)) {
  return { status: 'FAILED', stage: 'input', reason: `Invalid args: inputPath=${JSON.stringify(inputPath)}, inputType=${JSON.stringify(inputType)} — need inputPath plus inputType of 'plan' or 'spec'.` }
}
const specPath = inputType === 'spec' ? inputPath : null
// Task ids to force-rerun on resume: appends a note to ONLY these tasks' implementer
// prompts, busting their resume cache (and nothing earlier) so a task that failed on a
// now-resolved environmental blocker actually re-runs live. Downstream tasks that were
// never dispatched (loop broke at the failure) are fresh calls and run automatically.
const forceRerun = new Set(Array.isArray(_args.forceRerun) ? _args.forceRerun : [])

// ---------- schemas ----------
const PLANNER_OUT = {
  type: 'object', required: ['planPath'],
  properties: { planPath: { type: 'string' }, summary: { type: 'string' } },
}

const PARSED = {
  type: 'object', required: ['tasks', 'validationCommands'],
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'title', 'what', 'files', 'tests', 'doneWhen', 'dependsOn'],
        properties: {
          id: { type: 'string' }, title: { type: 'string' }, what: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
          tests: { type: 'string' }, doneWhen: { type: 'string' },
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

// Model policy (mirrors run-review.md): opus = planner + all reviewers;
// sonnet = implementer/retry/validation/reviser/fixer; haiku = mechanical plan parse.
// ---------- shared prompt fragments ----------
const RESULT_NOTE = 'Return structured output: status (SUCCESS|FAILURE), summary (1-2 sentences), filesChanged (list), testOutput (pass/fail counts and the command), issues ("None" if none). Do NOT create git commits.'

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

1. Read the spec file in full.
2. Classify it: **bug** (something broken, an error, a regression), **chore** (refactoring, cleanup, migration, maintenance), or **feature** (everything else — the default).
3. Read ~/.claude/commands/plan/{type}.md for the classified type and execute it exactly as written, treating the spec file content as its $ARGUMENTS.
4. Return structured output with planPath = the plan file path you produced, and a one-line summary. Do NOT create git commits.`
}

function planReviewerPrompt(round, lens, applied) {
  const decided = decisions.length
    ? `\n## Resolved decisions from the user\nThese settle previously-raised NEEDS_DECISION conflicts. Treat them as spec-level intent: conflicts they resolve are now DETERMINED with the chosen resolution, never NEEDS_DECISION again.\n${JSON.stringify(decisions, null, 2)}\n`
    : ''
  const lensNote = lens
    ? `\nYou are one of ${REVIEW_LENSES.length} parallel independent reviewers, each with a different focus. Run ALL of plan-review.md's checks, but dig deepest on YOUR lens — ${lens.key}: ${lens.focus} Report anything blocking you find regardless of lens.\n`
    : ''
  const appliedNote = applied.length
    ? `\n## Resolutions already applied in earlier rounds\nDo NOT re-report these — they are done. If one of them did NOT actually resolve its incoherence (the same seam is still broken), list it under \`repeats\` instead of \`determined\` — that signals a non-converging plan defect.\n${applied.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n`
    : ''
  return `You are the plan-reviewer subagent defined in ~/.claude/commands/exec/plan-review.md. Review round ${round}.

1. Read ~/.claude/commands/exec/plan-review.md in full.
2. Execute its Step 1 reviewer prompt exactly, with {plan-file-path} = ${planPath} and {spec-file-path} = ${specPath ?? '(none — omit spec-specific instructions)'}.
${decided}${lensNote}${appliedNote}
You are read-only — do NOT modify the plan or any file.

Instead of its markdown report format, return structured output:
- verdict: PASS | NEEDS_WORK
- determined: list of strings, one per Blocking-DETERMINED finding — the incoherence, which tasks/lines conflict, and the EXACT resolution to apply. Report EVERY determined finding you can see this round, not just the most important one — each finding you hold back costs a full extra review round.
- needsDecision: list of {conflict, options} for Blocking-NEEDS_DECISION findings (options are 2-3 concrete choices; do NOT pick one)
- repeats: list of previously-applied resolutions whose incoherence is still present (empty on a healthy run)
- nits: list of strings`
}

function planReviserPrompt(determined, round) {
  return `You are the plan-reviser subagent defined in ~/.claude/commands/exec/plan-review.md (its Step 2 reviser prompt). Revise round ${round}.

1. Read ~/.claude/commands/exec/plan-review.md in full and follow its Step 2 reviser instructions exactly, with {plan-file-path} = ${planPath}${specPath ? ` and {spec-file-path} = ${specPath}` : ' (no spec)'}.

## Findings to apply (each includes its exact resolution)
${determined.map((f, i) => `${i + 1}. ${f}`).join('\n')}

Findings may come from independent parallel reviewers and can overlap — where two findings describe the same incoherence, apply the fix once.

Remember: edit the plan .md IN PLACE, preserve the parseable \`### T{N}: {title}\` structure and field names exactly, do not expand scope, do not touch code, no git commits.

Return structured output: status (SUCCESS|FAILURE), summary (what changed per finding), filesChanged, issues ("None" if none).`
}

async function parseTasks(round) {
  return agent(`Read the plan file at ${planPath} in full. Parse round ${round}.

Extract every task section with a heading like \`### T{N}: {title}\`. For each task return:
- id: "T{N}" exactly as in the heading
- title
- what: the What field
- files: the Files field split into individual file paths (empty list if unclear)
- tests: the Tests field verbatim (empty string if absent)
- doneWhen: the Done when field
- dependsOn: the Depends on field as a list of task ids like "T2" (empty list for none/"-")

Also return validationCommands: the plan's final validation commands (from a Validation/Verification section), as a list of shell commands (empty list if none).`,
    { label: `parse tasks (round ${round})`, model: 'haiku', effort: 'low', phase: 'Parse', schema: PARSED })
}

function implementerPrompt(t, isFirst, hasParallelSiblings) {
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
**What:** ${t.what}
**Files:** ${t.files.join(', ') || '(see plan)'}
**Tests:** ${t.tests || '(none specified — pick the cheapest covering gate per the rules below)'}
**Done when:** ${t.doneWhen}

## Context
- Read the full plan file for overall context.
- Read CLAUDE.md to discover the test runner and project conventions.
- Implement the task: write code, write tests.${parallelNote}${baselineNote}${rerunNote}

${TEST_GATE}

${RESULT_NOTE}`
}

function diagnosticPrompt(t, previous) {
  return `A task implementation failed. Fix it.

## Plan file: ${planPath}
## Failed task: ${t.id}: ${t.title}
## Previous attempt result:
${JSON.stringify(previous, null, 2)}

## Instructions
1. Read the plan for context.
2. Examine the current codebase — check files that were supposed to be created/modified.
3. Identify what went wrong and FIX it.
4. Run the task's scoped \`Tests:\` gate (impacted tests only, not the full suite) until it passes — under a hard time wall. Backend mocha must use \`--exit --timeout 0\` wrapped in \`timeout 120\`. A "test timeout / hang" that clears the wall is almost always the \`--exit\` bug or a downed DB/VPN, NOT a code defect — verify that hypothesis FIRST (retry once with \`--exit\`, check the DB socket) before treating it as a real failure. If it is env, report status FAILURE with issues explaining the blocker; do not re-run a hanging command repeatedly.

${RESULT_NOTE}`
}

function validationPrompt(validationCommands) {
  const cmds = validationCommands.length
    ? `Validation commands from the plan:\n${validationCommands.map(c => `- ${c}`).join('\n')}`
    : 'The plan lists no explicit validation commands: read the plan and CLAUDE.md and run the project full test suite / build.'
  return `Run final cross-task validation for the plan at ${planPath}. All tasks are implemented; catch cross-task regressions.

${cmds}

This is the ONE full-suite run after baseline. Wrap backend mocha in \`timeout 180\` with \`--exit --timeout 0\`. Skip suites whose external prerequisite is confirmed down and note them; report pre-existing env failures separately from genuine regressions.

Return structured output: status SUCCESS only if there are no genuine regressions (env-blocked suites noted in issues do not fail the run), summary, testOutput, issues. Do NOT create git commits.`
}

// Lens keys must match the table in review-panel.md — definitions live there only.
const CODE_LENSES = ['correctness', 'resilience', 'tests']

function codeReviewerPrompt(round, lens) {
  const lensNote = lens
    ? `\n3. You are one of ${CODE_LENSES.length} parallel independent reviewers of the same diff. Read ~/.claude/commands/exec/review-panel.md and apply YOUR lens — \`${lens}\` — as its Lenses table defines: run ALL the angles, dig deepest on your lens, and report every blocking finding you can see regardless of lens (each finding you hold back costs a full extra round).\n`
    : ''
  return `You are the reviewer subagent defined in ~/.claude/commands/exec/review-loop.md. Review round ${round}.

1. Read ~/.claude/commands/exec/review-loop.md in full.
2. Execute its Step 1 reviewer prompt exactly, with {plan-file-path} = ${planPath} and no spec (omit spec-specific instructions). The plan is the scope and acceptance gate for the uncommitted diff.
${lensNote}
You are read-only — do NOT modify any files.

Instead of its markdown report format, return structured output:
- verdict: PASS | NEEDS_WORK
- blocking: list of strings, one per blocking finding — "file:line — what's wrong — the input/scenario that triggers it — expected fix"
- nits: list of strings`
}

function fixerPrompt(blocking, round) {
  return `You are the fixer subagent defined in ~/.claude/commands/exec/review-loop.md (its Step 2 fixer prompt). Fix round ${round}.

1. Read ~/.claude/commands/exec/review-loop.md in full and follow its Step 2 fixer instructions exactly, with {plan-file-path} = ${planPath} and no spec.

## Blocking findings
${blocking.map((f, i) => `${i + 1}. ${f}`).join('\n')}

Findings may come from independent parallel reviewers and can overlap — where two describe the same defect, fix it once. Fix every blocking finding; do not address nits. Verify ONLY what you changed. No git commits.

Return structured output: status (SUCCESS|FAILURE), summary (what was fixed per finding), filesChanged, testOutput (the specific verification you ran), issues ("None" if none).`
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
  const p = await agent(plannerPrompt(), { label: 'planner', model: 'opus', effort: 'high', phase: 'Plan', schema: PLANNER_OUT })
  if (!p?.planPath) return { status: 'FAILED', stage: 'plan', reason: 'Planner did not produce a plan file.' }
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
// Round 1 is a parallel lens panel (all seams exist from the start — catch them at
// once). Later rounds are single full reviewers. Loop-until-dry: keep revising while
// each round surfaces NEW determined findings; a REPEAT of an applied resolution
// means non-convergence (overloaded task) and stops immediately. Hard backstop: 4 rounds.
phase('Plan review')
let planReview = `SKIPPED (hand-written plan with ${parsed.tasks.length} tasks)`
let planNits = []
if (autoPlanned || parsed.tasks.length > 2) {
  const MAX_REVIEW_ROUNDS = 4
  const applied = []
  let revised = 0
  for (let round = 1; ; round++) {
    let r
    if (round === 1) {
      const panel = (await parallel(REVIEW_LENSES.map(l => () =>
        agent(planReviewerPrompt(1, l, applied), { label: `plan review r1:${l.key}`, model: 'opus', effort: 'high', phase: 'Plan review', schema: PLAN_REVIEW_OUT })
      ))).filter(Boolean)
      if (!panel.length) return { status: 'FAILED', stage: 'plan-review', planPath, reason: 'All panel reviewers died.' }
      r = {
        verdict: panel.some(p => p.verdict === 'NEEDS_WORK') ? 'NEEDS_WORK' : 'PASS',
        determined: panel.flatMap(p => p.determined ?? []),
        needsDecision: panel.flatMap(p => p.needsDecision ?? []),
        repeats: panel.flatMap(p => p.repeats ?? []),
        nits: panel.flatMap(p => p.nits ?? []),
      }
    } else {
      r = await agent(planReviewerPrompt(round, null, applied), { label: `plan review r${round}`, model: 'opus', effort: 'high', phase: 'Plan review', schema: PLAN_REVIEW_OUT })
      if (!r) return { status: 'FAILED', stage: 'plan-review', planPath, reason: 'Plan reviewer agent died.' }
    }
    planNits = r.nits ?? []
    if (r.needsDecision?.length) {
      // All-or-nothing: apply no DETERMINED fixes; the human decides first, then we
      // resume with `decisions` in args and re-review in one coherent pass.
      return { status: 'NEEDS_DECISION', planPath, planReview: 'NEEDS_DECISION', needsDecision: r.needsDecision, nits: planNits }
    }
    if (r.repeats?.length) {
      return { status: 'UNRESOLVED_PLAN', planPath, planReview: 'UNRESOLVED', findings: r.repeats, reason: 'Applied resolutions did not stick — non-converging plan defect (usually one overloaded task). Re-plan or split rather than revising again.', nits: planNits }
    }
    const det = r.determined ?? []
    if (r.verdict === 'PASS' || det.length === 0) {
      planReview = revised ? `PASS (after ${revised} revise rounds)` : 'PASS'
      break
    }
    if (round >= MAX_REVIEW_ROUNDS) {
      return { status: 'UNRESOLVED_PLAN', planPath, planReview: 'UNRESOLVED', findings: det, reason: `Hit the ${MAX_REVIEW_ROUNDS}-round backstop with new findings still appearing.`, nits: planNits }
    }
    log(`Plan review round ${round}: ${det.length} determined finding(s) — spawning reviser`)
    const rev = await agent(planReviserPrompt(det, revised + 1), { label: `plan revise r${revised + 1}`, model: 'sonnet', phase: 'Plan review', schema: AGENT_RESULT })
    if (rev?.status !== 'SUCCESS') {
      return { status: 'UNRESOLVED_PLAN', planPath, planReview: 'UNRESOLVED', findings: det, reason: 'Reviser failed.', nits: planNits }
    }
    applied.push(...det)
    revised++
    parsed = await parseTasks(revised + 1) // reviser edited the plan — re-parse before executing
    if (!parsed?.tasks?.length) return { status: 'FAILED', stage: 'parse', planPath, reason: 'Re-parse after revision found no tasks.' }
  }
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

async function runTask(t, hasParallelSiblings) {
  const isFirst = first
  first = false
  const attempt = await agent(implementerPrompt(t, isFirst, hasParallelSiblings), { label: `${t.id}: ${t.title}`, model: 'sonnet', phase: 'Execute', schema: AGENT_RESULT })
  if (attempt?.status === 'SUCCESS') return { ...attempt, retried: false }
  log(`${t.id} failed — spawning diagnostic retry`)
  const retry = await agent(diagnosticPrompt(t, attempt ?? { status: 'FAILURE', summary: 'Implementer agent died with no report.' }), { label: `${t.id}: retry`, model: 'sonnet', phase: 'Execute', schema: AGENT_RESULT })
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
if (!execFailed && validation === 'PASS') {
  let fixed = 0
  for (let round = 1; ; round++) {
    let r
    if (round === 1) {
      // Wide first sweep: 3 lens panelists in parallel (review-panel.md policy).
      // Later rounds verify fixes — one full reviewer is the right check there.
      const panel = (await parallel(CODE_LENSES.map(l => () =>
        agent(codeReviewerPrompt(1, l), { label: `code review r1:${l}`, model: 'opus', effort: 'high', phase: 'Code review', schema: CODE_REVIEW_OUT })
      ))).filter(Boolean)
      if (!panel.length) { review = 'UNRESOLVED'; unresolvedFindings = ['All panel reviewers died.']; break }
      r = {
        verdict: panel.some(p => p.verdict === 'NEEDS_WORK') ? 'NEEDS_WORK' : 'PASS',
        blocking: panel.flatMap(p => p.blocking ?? []),
        nits: panel.flatMap(p => p.nits ?? []),
      }
    } else {
      r = await agent(codeReviewerPrompt(round, null), { label: `code review r${round}`, model: 'opus', effort: 'high', phase: 'Code review', schema: CODE_REVIEW_OUT })
      if (!r) { review = 'UNRESOLVED'; unresolvedFindings = ['Reviewer agent died.']; break }
    }
    reviewNits = r.nits ?? []
    if (r.verdict === 'PASS') {
      review = fixed ? `PASS (panel, after ${fixed} fix rounds)` : 'PASS (panel)'
      break
    }
    if (fixed >= 2) { review = 'UNRESOLVED'; unresolvedFindings = r.blocking ?? []; break }
    const fix = await agent(fixerPrompt(r.blocking ?? [], fixed + 1), { label: `fix r${fixed + 1}`, model: 'sonnet', phase: 'Code review', schema: AGENT_RESULT })
    if (fix?.status !== 'SUCCESS') { review = 'UNRESOLVED'; unresolvedFindings = r.blocking ?? []; break }
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
  nits: reviewNits,
  planNits,
}
