export const meta = {
  name: 'review-flow-only',
  description: 'Standalone Validate + Code-review extraction of run-review-flow — re-verify an existing implementation (e.g. after a manual fix) with the same codex panel and fixer loop',
  whenToUse: 'The sanctioned post-manual-fix path from exec:run-flow (never exec:review-loop/review-panel). Args: { planPath, validationCommands?: string[], skipValidation?: boolean, changedFiles?: string[] (the complete delta since the last full validation pass — delta-scopes validation; omit for a full pass), baseRef?: string (committed-range mode: review git diff <baseRef> — working tree vs base — instead of the uncommitted diff; pass the branch merge-base for a fully committed feature branch, e.g. a completed Ralph run), specPath?: string (the user-authored source spec — intent authority above the plan; enables spec-grounded PLAN_DEVIATION triage) }.',
  phases: [
    { title: 'Validate', detail: 'full-suite cross-task validation + runtime verification' },
    { title: 'Code review', detail: 'all-codex lens panel → triage gate (stale/unrealistic findings rejected) → fix loop while confirmed count shrinks; plateau after 2 fixes or 4 fix rounds stops (review-panel.md policy)' },
  ],
}

// ---------- input ----------
// Verbatim extraction of run-review-flow.js's Validate + Code review phases (first
// proven useful as a scratchpad one-off, session d07c2fb6, 2026-07-25). Keep the
// prompts in lockstep with run-review-flow.js — policy lives in review-loop.md /
// review-panel.md, so drift here means the two paths review to different standards.
const _args = typeof args === 'string' ? JSON.parse(args) : (args ?? {})
const planPath = _args.planPath
const validationCommands = Array.isArray(_args.validationCommands) ? _args.validationCommands : []
const skipValidation = _args.skipValidation === true
// Delta scope: the complete set of files changed since the last FULL green-except-
// the-fixed-finding validation pass (the orchestrator knows this; git can't — the
// whole feature sits uncommitted in the tree). Present → validation skips suites
// and runtime steps the delta provably cannot affect. Absent → full pass.
const changedFiles = Array.isArray(_args.changedFiles) ? _args.changedFiles : []
// Committed-range mode (review-loop.md's baseRef mode): the feature is already
// committed (e.g. a completed Ralph branch), so the diff under review is
// `git diff <baseRef>` — working tree vs base — covering the committed work plus
// any uncommitted fixer edits in later rounds. Absent → uncommitted-diff mode.
const baseRef = typeof _args.baseRef === 'string' && _args.baseRef.trim() ? _args.baseRef.trim() : null
// Source spec (intent authority): the user-authored artifact the plan was derived
// from. Authority hierarchy: spec (intent) > plan (Done-when, invariants) >
// mechanism prescriptions — the triage gate uses it to adjudicate PLAN_DEVIATION.
const specPath = typeof _args.specPath === 'string' && _args.specPath.trim() ? _args.specPath.trim() : null
if (!planPath) {
  return { status: 'FAILED', stage: 'input', reason: 'Invalid args: need planPath (plus optional validationCommands, skipValidation).' }
}

// ---------- schemas ----------
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

// Triage gate output: the reevaluator seat between panel and fixer — re-verifies
// each finding against CURRENT code (stale reports) and the realism floor
// (concrete-but-unreachable scenarios) before any fix round is paid for.
const TRIAGE_OUT = {
  type: 'object', required: ['confirmed', 'rejected'],
  properties: {
    confirmed: { type: 'array', items: { type: 'string' } },
    rejected: { type: 'array', items: { type: 'string' } },
    planDeviations: { type: 'array', items: { type: 'string' } },
  },
}

const CODEX_CODE_OUT = {
  type: 'object', required: ['verdict'],
  properties: {
    verdict: { enum: ['PASS', 'NEEDS_WORK', 'UNAVAILABLE'] },
    blocking: { type: 'array', items: { type: 'string' } },
    nits: { type: 'array', items: { type: 'string' } },
  },
}

// ---------- prompts (kept identical to run-review-flow.js) ----------
const REALISM_RULE = `Realism floor: a blocking finding's failure scenario must be reachable by a realistic actor through the app's actual entry points — the UI as built or the documented API contract. Scenarios requiring inputs the UI cannot produce, concurrency the deployment does not actually exhibit, or data magnitudes outside the domain's real ranges are nits. Rigor machinery (locks, concurrency proofs, fault injection, extra precision handling) is warranted only where the spec/plan explicitly asks for it — an unrequested rigor upgrade is a nit, never blocking.`

const codexWrapperRules = (slug) => `Run codex from the repo root in ONE Bash call with timeout 600000: write the composed prompt to a temp file, then
   codex exec --sandbox read-only --ephemeral -o <tmpdir>/codex-review-${slug}.md - < <tmpdir>/codex-prompt-${slug}.md
The "-${slug}" filename suffix is MANDATORY — parallel panelists share the temp dir, and unsuffixed files get overwritten by the other reviewers mid-run.
Then read the output file and transcribe codex's findings VERBATIM into the structured output — do not re-judge, drop, merge, or add findings of your own.

If the codex CLI is missing, exits non-zero, produces no output file, or hits the timeout: return verdict UNAVAILABLE with all lists empty. Never invent a review, never retry more than once.`

const diffScopeNote = baseRef
  ? `\nThe changes under review are \`git diff ${baseRef}\` (working tree vs that base — the committed feature work plus any uncommitted fix edits). Wherever review-loop.md says "the uncommitted changes" or bare \`git diff\`, use this diff instead. Untracked files still count (git status).\n`
  : ''

function deltaNote() {
  if (!changedFiles.length) return ''
  return `
## Delta scope — a previous FULL validation pass of this plan already ran
That pass was green except for the finding(s) a manual fix then addressed. The complete delta since it (per the orchestrator — git cannot derive this, the whole feature is uncommitted):
${changedFiles.map(f => `- ${f}`).join('\n')}

Scope this pass to the delta — by AFFECTED BEHAVIOR, never by edit:
- A validation command may be SKIPPED only when no changed file can affect its result (e.g. skip the backend suite when every changed file is frontend-only). Name each skipped command and the reason in testOutput. When in doubt, run it.
- Runtime Verification steps are MANDATORY when their flow renders, calls, or depends on any changed file's component/route — above all every step exercising the manual fix's failure scenario. A step the delta provably cannot affect may be skipped with a one-line justification in testOutput.
- An expensive owned procedure (e.g. a before/after bundle byte-comparison requiring a base-revision rebuild) may reuse the previous pass's recorded result when no changed file can affect that artifact — say so in testOutput.
Delta-scope skips justified this way are NOT unexecuted-criterion failures; "every Runtime Verification step" in the success gate means every step in delta scope.
`
}

function validationPrompt(cmds0) {
  const cmds = cmds0.length
    ? `Validation commands from the plan:\n${cmds0.map(c => `- ${c}`).join('\n')}`
    : 'The plan lists no explicit validation commands: read the plan and CLAUDE.md and run the project full test suite / build.'
  return `Run final cross-task validation for the plan at ${planPath}. All tasks are implemented; catch cross-task regressions.

${cmds}

${changedFiles.length ? 'This re-verify pass is DELTA-SCOPED — see the Delta scope section below.' : 'This is the ONLY full-suite run of the entire pipeline — no baseline was recorded, so a failure in code no task touched may be pre-existing: check git history / the base branch before counting it as a regression.'} Wrap backend mocha in \`timeout 180\` with \`--exit --timeout 0\`. Run every command in the FOREGROUND — never \`run_in_background\` (ending your turn while waiting on a background command kills the task without a report). Skip suites whose external prerequisite is confirmed down and note them; report pre-existing env failures separately from genuine regressions.

Gates beyond the commands:
- **Skipped ≠ pass.** A test that covers a plan acceptance criterion but is SKIPPED or not run (missing fixture, env var, login state) is a FAILURE of that criterion, not a pass — name the criterion in issues. A green suite that never executed the acceptance test proves nothing.
- **Runtime Verification.** If the plan has a Runtime Verification section, execute every step live with the playwright-cli skill against the running app: open the route, assert the element/behavior actually renders, perform the action, verify the observable outcome. Report each step's observed result in testOutput. A step you could not execute is a FAILURE with the blocker named. Static checks (build/tsc) never substitute for a runtime step — framework wiring (DI, routing, template rendering) fails invisibly to the compiler.
${deltaNote()}
Return structured output: status SUCCESS only if there are no genuine regressions AND no acceptance criterion is covered only by a skipped/unexecuted test AND every in-scope Runtime Verification step passed (env-blocked suites noted in issues, and delta-scope skips justified in testOutput, do not fail the run), summary, testOutput, issues. Do NOT create git commits.`
}

// Lens keys must match the table in review-panel.md — definitions live there only.
const CODE_LENSES = ['correctness', 'resilience', 'tests']

function codexCodeReviewerPrompt(lens, round = 1, applied = [], disputed = [], deviations = []) {
  const deviationsNote = deviations.length
    ? `\n## Plan deviations already ESCALATED for human decision — append this block verbatim to codex's prompt\nThese plan-vs-code conflicts are already escalated for human ruling. Do NOT re-report them, as blocking or otherwise.\n${deviations.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n`
    : ''
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
2. Compose codex's prompt: review-loop.md's Step 1 reviewer prompt with {plan-file-path} = ${planPath}${specPath ? ` and {spec-file-path} = ${specPath}` : ' and no spec (omit spec-specific instructions)'}.${baseRef ? ` baseRef = ${baseRef}: apply review-loop.md's committed-range mode — the composed codex prompt MUST tell codex to run \`git diff ${baseRef}\` (never bare git diff) as the diff under review.` : ''} ${role} Tell codex to report in review-loop.md's exact "### Review" format. The composed prompt must be fully self-contained: paste the Step 1 reviewer prompt text and lens definitions themselves — never instruct codex to read files under ~/.claude.
3. ${codexWrapperRules(lens ? `code-r${round}-${lens}` : `code-r${round}`)}
${appliedNote}${disputedNote}${deviationsNote}
Structured output:
- verdict: PASS | NEEDS_WORK | UNAVAILABLE
- blocking: list of strings, one per blocking finding from codex's report — "file:line — what's wrong — the input/scenario that triggers it — expected fix". Findings codex reports under "Plan deviations" (or labels PLAN-DEVIATION) go in this list too, verbatim with the PLAN-DEVIATION label kept, and count toward a NEEDS_WORK verdict — the triage gate is the adjudicator that escalates them for human decision.
- nits: list of strings`
}

function triagePrompt(blocking, round) {
  return `You are the finding-triage gate between the code-review panel and the fixer, round ${round}. Independent parallel reviewers produced the blocking findings below. Before any fix work is dispatched, re-evaluate each one against the CURRENT code and the plan: reviewers sometimes report from stale expectations (a change already applied) or construct concrete-but-unreachable scenarios, and a wasted fix round costs far more than this check.

Plan (scope and acceptance authority): ${planPath}${specPath ? `\nSpec (intent authority): ${specPath}` : ''}
${baseRef ? `The diff under review is \`git diff ${baseRef}\` (committed + uncommitted).` : ''}
## Findings
${blocking.map((f, i) => `${i + 1}. ${f}`).join('\n')}

For EACH finding, read the current code at its location — plus enough surrounding context to judge it (callers, route config, the component a route actually renders, templates/inheritance) — and classify:
- **CONFIRMED**: the defect is present in the current code AND its failure scenario is reachable by a realistic actor through the app's actual entry points (the UI as built, the documented API contract).
- **STALE**: the claimed defect is not present in the current code (already fixed, or the reviewer misread) — cite file:line evidence.
- **UNREALISTIC**: technically constructible but the scenario requires inputs the UI cannot produce, concurrency the deployment does not exhibit, or data magnitudes outside the domain's real ranges — or it mandates rigor machinery (locks, concurrency proofs, fault injection, precision handling) the spec/plan never asked for. One-line rationale grounded in the spec/plan or the code.
- **DUPLICATE**: same defect as another finding — confirm one, mark the rest duplicates of it.
- **PLAN_DEVIATION**: the finding's substance is plan non-conformance (a missed mechanism prescription, a Hard Invariant's letter, an enumerated list) but the code is behaviorally defensible — because fixing toward the plan's letter would violate another plan clause/invariant, contradict the spec's intent, or degrade real behavior; because the plan's clauses are mutually unsatisfiable on this point (the spec's intent is the tiebreaker for which side the code may keep); or because the deviation is documented (e.g. context.md) and sound on its own merits. Authority hierarchy: spec (intent) > plan (Done-when, invariants) > mechanism prescriptions. NOT a plan deviation: code failing a Done-when because it is genuinely broken or incomplete — that is CONFIRMED. These are escalated for HUMAN decision, never auto-fixed.

Judge severity, never difficulty: a hard-to-fix real defect is CONFIRMED. When genuinely uncertain whether a defect is real, CONFIRM it — the fixer's own verification is the next check; this gate exists to kill clear noise, not to shave real work. Likewise, when uncertain whether something is a genuine defect or a plan deviation, CONFIRM it — the escape hatch is for clear plan-vs-code conflicts only. You are read-only: modify no files, no git commits.

Return structured output:
- confirmed: the findings to fix, verbatim (empty if none survive)
- rejected: one string per STALE/UNREALISTIC/DUPLICATE finding — "{the finding} — {CLASSIFICATION} — {rationale/evidence}"
- planDeviations: one string per PLAN_DEVIATION — "{the finding} — {which plan clause vs which code reality} — {why fixing toward the plan's letter would be wrong}"`
}

function fixerPrompt(blocking, round) {
  return `You are the fixer subagent defined in ~/.claude/commands/exec/review-loop.md (its Step 2 fixer prompt). Fix round ${round}.

1. Read ~/.claude/commands/exec/review-loop.md in full and follow its Step 2 fixer instructions exactly, with {plan-file-path} = ${planPath} and no spec.
${diffScopeNote}
## Blocking findings
${blocking.map((f, i) => `${i + 1}. ${f}`).join('\n')}

Every finding above already passed a triage gate that verified it against the current code and a realism floor — Step 2's "dispute" option is NOT available here: fix every finding. Findings can still overlap — where two describe the same defect, fix it once. Do not address nits. No git commits.

What you verify is the finding's FAILURE SCENARIO, not your edit. Logic findings: typecheck/build the touched files and run the single covering test (write one if the finding was a missing/weak test). Rendering/wiring/reachability findings (element not rendered, provider not injected, route never reaches the code): typecheck/build is NOT sufficient — trace the actual chain (route config → the component the route REALLY renders → its template/inheritance chain), cite file:line for every hop, and confirm your fix lies ON that chain. If the finding names a component, verify it is the one the route renders BEFORE fixing it; if it is not, fix the one that is and say so in summary. If a fix genuinely cannot be verified without running the app, state exactly what runtime evidence is missing in issues — never claim it fixed on a compile alone.

Test scope: the single covering test or spec file per finding is the ceiling — re-run only that after a failed attempt, and never the feature-wide or full suite (the re-review and validation layers re-prove the whole surface after this round; a fixer-run broad suite is pure repeat cost).

Return structured output: status (SUCCESS|FAILURE), summary (what was fixed per finding, including the reachability trace for wiring fixes), filesChanged, testOutput (the specific verification you ran), issues ("None" if none).`
}

// ---------- Phase: Validate ----------
phase('Validate')
let validation = 'SKIPPED'
let validationIssues = null
if (!skipValidation) {
  const v = await agent(validationPrompt(validationCommands), { label: 'final validation', model: 'sonnet', phase: 'Validate', schema: AGENT_RESULT })
  validation = v?.status === 'SUCCESS' ? 'PASS' : 'FAIL'
  validationIssues = v?.issues ?? v?.summary ?? 'Validation agent died.'
}

// ---------- Phase: Code review ----------
phase('Code review')
let review = 'NOT RUN'
let reviewNits = []
let unresolvedFindings = []
let triageRejected = []
let planDeviations = [] // PLAN_DEVIATION escalations — human decision, never auto-fixed
if (validation !== 'FAIL') {
  let fixed = 0
  let prevBlocking = Infinity
  const appliedFixes = [] // per fix round: findings given to the fixer + its own account — r≥2 verifies each fix against its finding's scenario
  for (let round = 1; ; round++) {
    let r
    if (round === 1) {
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
      r = await agent(codexCodeReviewerPrompt(null, round, appliedFixes, triageRejected, planDeviations), { label: `code review r${round}:codex`, model: 'haiku', phase: 'Code review', schema: CODEX_CODE_OUT })
      if (!r) { review = 'UNRESOLVED'; unresolvedFindings = ['Reviewer agent died.']; break }
      if (r.verdict === 'UNAVAILABLE') { review = 'UNRESOLVED'; unresolvedFindings = [`Codex CLI unavailable at code-review round ${round} — fixes not re-verified.`]; break }
    }
    reviewNits = r.nits ?? []
    const devTag = () => planDeviations.length ? `; ${planDeviations.length} plan deviations escalated` : ''
    if (r.verdict === 'PASS') {
      review = fixed ? `PASS (panel, after ${fixed} fix rounds${devTag()})` : `PASS (panel${devTag()})`
      break
    }
    // Triage gate (reevaluator seat): re-verify each blocking finding against the
    // current code + the realism floor BEFORE paying for a fix round. Convergence/
    // plateau checks run on the CONFIRMED count. If the triage agent dies, fail
    // open: fix everything rather than silently drop findings.
    let blocking = r.blocking ?? []
    if (blocking.length) {
      const t = await agent(triagePrompt(blocking, round), { label: `triage r${round}`, model: 'sonnet', phase: 'Code review', schema: TRIAGE_OUT })
      if (t) {
        triageRejected.push(...(t.rejected ?? []))
        planDeviations.push(...(t.planDeviations ?? []))
        blocking = t.confirmed ?? []
        log(`triage r${round}: ${blocking.length} confirmed, ${(t.rejected ?? []).length} rejected, ${(t.planDeviations ?? []).length} plan deviations escalated`)
      }
    }
    if (!blocking.length) {
      review = fixed ? `PASS (panel; round-${round} findings all triaged out, after ${fixed} fix rounds${devTag()})` : `PASS (panel; round-${round} findings all triaged out${devTag()})`
      break
    }
    // Convergence-aware stop (review-panel.md policy, same as run-review-flow.js).
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
  status: validation === 'FAIL' ? 'VALIDATION_FAILED' : 'COMPLETE',
  planPath,
  validation,
  validationIssues,
  review,
  unresolvedFindings,
  planDeviations,
  triageRejected,
  nits: reviewNits,
}
