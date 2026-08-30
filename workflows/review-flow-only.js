export const meta = {
  name: 'review-flow-only',
  description: 'Standalone Validate + Code-review extraction of run-review-flow — re-verify an existing implementation (e.g. after a manual fix) with the same codex panel and fixer loop',
  whenToUse: 'The sanctioned post-manual-fix path from exec:run-flow (never exec:review-loop/review-panel). Args: { planPath, validate?: "off"|"targeted"|"full" (default "off" — the implementer already ran the suite; "targeted" runs only what the diff can affect), validationCommands?: string[] (used only when validate != "off"), skipValidation?: boolean (legacy alias for validate:"off"), changedFiles?: string[] (explicit delta when git cannot derive it), baseRef?: string (committed-range mode: review git diff <baseRef> — working tree vs base — instead of the uncommitted diff; pass the branch merge-base for a fully committed feature branch, e.g. a completed Ralph run), specPath?: string (the user-authored source spec — intent authority above the plan; enables spec-grounded PLAN_DEVIATION adjudication) }.',
  phases: [
    { title: 'Validate', detail: 'off by default; targeted = only what the diff can affect; full = every command' },
    { title: 'Code review', detail: 'all-codex lens panel → single opus adjudicator (judges validity AND whether fixing is warranted, then fixes) → re-review loop; plateau after 2 fixes or 4 rounds stops' },
  ],
  model: 'claude-opus-5',
}

// ---------- input ----------
// Started as a verbatim extraction of run-review-flow.js's Validate + Code review
// phases (session d07c2fb6, 2026-07-25). NO LONGER IN LOCKSTEP with that file, as of
// the 2026-08-27 revamp — two deliberate divergences:
//   1. Validation is off by default. Whatever produced the diff (ralph, continue-dev,
//      run-flow) already ran the suite; re-running it whole is repeat cost that
//      delays the panel and proves nothing new.
//   2. The sonnet triage gate and the sonnet fixer are collapsed into ONE opus
//      adjudicator holding both judgement and repair. Splitting them forced the
//      fixer to repair everything triage confirmed, with no seat empowered to say
//      "real, but not worth fixing".
// run-review-flow.js still has the old two-seat shape. Policy for the codex panel
// itself still lives in review-loop.md / review-panel.md and IS still shared.
const _args = typeof args === 'string' ? JSON.parse(args) : (args ?? {})
const planPath = _args.planPath
const validationCommands = Array.isArray(_args.validationCommands) ? _args.validationCommands : []

// Validation mode: 'off' (default) | 'targeted' | 'full'. skipValidation:true is
// honoured as a legacy alias for 'off'.
const VALIDATE_MODES = ['off', 'targeted', 'full']
const validateMode = typeof _args.validate === 'string' && _args.validate.trim()
  ? _args.validate.trim()
  : 'off'
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
  return { status: 'FAILED', stage: 'input', reason: 'Invalid args: need planPath (plus optional validate, validationCommands, baseRef, specPath).' }
}
if (!VALIDATE_MODES.includes(validateMode)) {
  return { status: 'FAILED', stage: 'input', reason: `Invalid validate: '${validateMode}' (expected one of ${VALIDATE_MODES.join(', ')}).` }
}
// Legacy alias wins only toward 'off' — an explicit validate: 'full' is never
// silently downgraded by a stale skipValidation flag from an old caller.
const effectiveValidate = _args.skipValidation === true && !_args.validate ? 'off' : validateMode

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

// Adjudicator output: ONE seat holding both judgement and repair. It decides which
// findings are real, which of the real ones are worth fixing, and then fixes those —
// so the four lists below are a complete accounting of every finding handed to it.
const ADJUDICATOR_OUT = {
  type: 'object', required: ['status', 'fixed', 'rejected', 'declined', 'summary'],
  properties: {
    status: { enum: ['SUCCESS', 'FAILURE'] },
    // "{finding} — {what changed} — {how the failure scenario was verified}"
    fixed: { type: 'array', items: { type: 'string' } },
    // not real: "{finding} — STALE|UNREALISTIC|DUPLICATE — {evidence}"
    rejected: { type: 'array', items: { type: 'string' } },
    // real, deliberately left: "{finding} — {why fixing is not warranted} — {residual risk}"
    declined: { type: 'array', items: { type: 'string' } },
    // plan-vs-code conflicts for HUMAN ruling, never auto-fixed
    planDeviations: { type: 'array', items: { type: 'string' } },
    filesChanged: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    issues: { type: 'string' },
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

// Only the adjudicator uses this now — it no longer reads review-loop.md, so the
// note states the scope directly instead of redirecting a phrase in that file.
const diffScopeNote = baseRef
  ? `\nThe changes under review are \`git diff ${baseRef}\` — the working tree vs that base, i.e. the committed feature work plus any uncommitted edits from earlier fix rounds. Never bare \`git diff\`. Untracked files still count (git status).\n`
  : '\nThe changes under review are the uncommitted working-tree diff (`git diff`), plus untracked files (`git status`).\n'

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

function validationPrompt(cmds0, mode) {
  const diffCmd = baseRef
    ? `git diff --name-only ${baseRef}`
    : 'git diff --name-only HEAD, plus untracked files from git status'
  const cmds = cmds0.length
    ? `Candidate validation commands:\n${cmds0.map(c => `- ${c}`).join('\n')}`
    : 'No explicit validation commands were given: read the plan and CLAUDE.md to find the project\'s suites.'

  const targeted = `Scope this pass to what the diff can actually affect. Derive the changed files yourself with \`${diffCmd}\`.

**Default is to SKIP, not to run.** The implementer already ran this project's suites against this code — re-running a suite the diff cannot affect buys nothing and delays the review panel.

- Run a validation command ONLY when a changed file can plausibly change its result (e.g. skip the backend suite when every changed file is frontend-only). Name every command you skipped and why in testOutput.
- Run a Runtime Verification step from the plan ONLY when its flow renders, calls, or depends on a changed file. These are the steps worth paying for — wiring failures (DI, routing, template rendering, a route that renders a different component than the plan assumed) are invisible to both the compiler and the code panel, and they are the main reason this phase exists at all.
- Never run a full/feature-wide suite to "be safe". If you genuinely cannot tell whether a command is affected, run it and say so.`

  const full = `Run every command below. ${changedFiles.length ? 'This re-verify pass is DELTA-SCOPED — see the Delta scope section.' : 'No baseline was recorded, so a failure in code no task touched may be pre-existing: check git history / the base branch before counting it as a regression.'}`

  return `Run cross-task validation for the plan at ${planPath}. All tasks are implemented; catch cross-task regressions.

${cmds}

${mode === 'targeted' ? targeted : full}

Wrap backend mocha in \`timeout 180\` with \`--exit --timeout 0\`. Run every command in the FOREGROUND — never \`run_in_background\` (ending your turn while waiting on a background command kills the task without a report). Skip suites whose external prerequisite is confirmed down and note them; report pre-existing env failures separately from genuine regressions.

Gates beyond the commands:
- **Skipped ≠ pass.** A test that covers a plan acceptance criterion but is SKIPPED or not run (missing fixture, env var, login state) is a FAILURE of that criterion, not a pass — name the criterion in issues. A green suite that never executed the acceptance test proves nothing. This is distinct from a command you deliberately skipped as out of scope above: that is a scoping decision, recorded in testOutput, not a failure.
- **Runtime Verification.** For every in-scope step, execute it live with the playwright-cli skill against the running app: open the route, assert the element/behavior actually renders, perform the action, verify the observable outcome. Report each step's observed result in testOutput. An in-scope step you could not execute is a FAILURE with the blocker named. Static checks (build/tsc) never substitute for a runtime step.
${deltaNote()}
Return structured output: status SUCCESS only if there are no genuine regressions AND no acceptance criterion is covered only by a skipped/unexecuted test AND every in-scope Runtime Verification step passed (env-blocked suites noted in issues, and out-of-scope skips justified in testOutput, do not fail the run), summary, testOutput, issues. Do NOT create git commits.`
}

// Lens keys must match the table in review-panel.md — definitions live there only.
const CODE_LENSES = ['correctness', 'resilience', 'tests']

function codexCodeReviewerPrompt(lens, round = 1, applied = [], disputed = [], deviations = [], declined = []) {
  const declinedNote = declined.length
    ? `\n## Findings the adjudicator judged REAL but deliberately did NOT fix — append this block verbatim to codex's prompt\nEach carries the reason it was left unfixed and the residual risk accepted. That was a deliberate ruling, recorded for the human. Do NOT re-report these as blocking. Report one again ONLY if you can show the accepted residual risk was understated because the defect is reachable in a way the rationale did not consider — say which.\n${declined.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n`
    : ''
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
${appliedNote}${disputedNote}${declinedNote}${deviationsNote}
Structured output:
- verdict: PASS | NEEDS_WORK | UNAVAILABLE
- blocking: list of strings, one per blocking finding from codex's report — "file:line — what's wrong — the input/scenario that triggers it — expected fix". Findings codex reports under "Plan deviations" (or labels PLAN-DEVIATION) go in this list too, verbatim with the PLAN-DEVIATION label kept, and count toward a NEEDS_WORK verdict — the triage gate is the adjudicator that escalates them for human decision.
- nits: list of strings`
}

function adjudicatorPrompt(blocking, round, priorRejected = [], priorDeclined = []) {
  // Round 2+: the codex re-reviewer is given this seat's earlier rulings and may
  // re-raise a declined finding when it can show the accepted risk was understated.
  // Without the same history here, the adjudicator would meet its own ruling cold.
  const priorNote = (priorRejected.length || priorDeclined.length)
    ? `\n## Your own rulings from earlier rounds
The reviewer was given these and told not to re-report them. If one appears above anyway, the reviewer is asserting your rationale was wrong — engage with that argument on its merits rather than repeating the ruling, and say which way you went and why.
${priorRejected.length ? `\nRejected as not real:\n${priorRejected.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n` : ''}${priorDeclined.length ? `\nReal, but you declined to fix:\n${priorDeclined.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n` : ''}`
    : ''
  return `You are the review adjudicator, round ${round} — a single seat holding BOTH judgement and repair. Independent parallel codex reviewers produced the blocking findings below. You decide which are real, which of the real ones are worth fixing, and you fix those yourself. No one downstream re-litigates your calls, and no one upstream can overrule them: the authority is yours.

Plan (scope and acceptance authority): ${planPath}${specPath ? `\nSpec (intent authority): ${specPath}` : ''}
${baseRef ? `The diff under review is \`git diff ${baseRef}\` (committed work plus any uncommitted edits).` : 'The diff under review is the uncommitted working-tree diff.'}

## Findings
${blocking.map((f, i) => `${i + 1}. ${f}`).join('\n')}
${priorNote}
## Step 1 — judge each finding
Read the current code at its location, plus enough context to judge it honestly (callers, route config, the component a route actually renders, templates and inheritance chains). Then place every finding in exactly one bucket:

- **FIX** — real, reachable by a realistic actor through the app's actual entry points, and worth repairing now.
- **REJECT** — not real. STALE (not present in current code: already fixed, or the reviewer misread — cite file:line), UNREALISTIC (requires inputs the UI cannot produce, concurrency the deployment does not exhibit, or data outside the domain's real ranges), or DUPLICATE (same defect as another finding — fix one, mark the rest).
- **DECLINE** — real, but fixing it is not warranted. This is the seat's whole point, so use it honestly and sparingly. Legitimate grounds: the fix costs materially more than the defect (a rewrite to close a cosmetic edge case), the repair would destabilise code outside this change's scope, or the finding is an unrequested rigor upgrade the spec and plan never asked for. **Never decline because a fix is hard, tedious, or time-consuming — difficulty is not a reason, and a hard real defect is a FIX.** Every decline must state the residual risk you are accepting.
- **PLAN_DEVIATION** — the substance is plan non-conformance (a missed mechanism prescription, a Hard Invariant's letter, an enumerated list) but the code is behaviourally defensible: fixing toward the plan's letter would violate another plan clause, contradict the spec's intent, or degrade real behaviour; or the plan's clauses are mutually unsatisfiable here; or the deviation is documented (e.g. context.md) and sound. Authority hierarchy: spec (intent) > plan (Done-when, invariants) > mechanism prescriptions. NOT a deviation: code failing a Done-when because it is genuinely broken or incomplete — that is FIX. These are escalated for HUMAN decision; never fix one.

Judge severity, never difficulty. When genuinely uncertain whether a defect is real, treat it as FIX. When uncertain whether it is a defect or a plan deviation, treat it as FIX. The rejection and decline buckets exist to kill clear noise and clear non-work, not to shave real work — your own repair is the next check, not a later gate.

## Step 2 — fix everything in the FIX bucket
${diffScopeNote}
Stay inside this diff's scope. Read the plan for context${specPath ? '; the spec is read-only context for intent — consult it to understand a finding, but never expand work beyond the plan\'s tasks' : ''}. A fix that grows past the plan's tasks is out of scope no matter how tempting.

What you verify is each finding's FAILURE SCENARIO, not your edit.
- Logic findings: typecheck/build the touched files and run the single covering test (write one if the finding was a missing or weak test).
- Rendering/wiring/reachability findings (element not rendered, provider not injected, route never reaches the code): a typecheck is NOT sufficient — these are invisible to the compiler by construction (e.g. Angular constructor DI is not inherited: a subclass that drops a base's injected param compiles fine and injects null). Trace the actual chain — route config → the component the route REALLY renders → its template/inheritance chain — cite file:line for every hop, and confirm your fix lies ON that chain. If a finding names a component, verify it is the one the route renders BEFORE fixing it; if it is not, fix the one that is and say so.
- If a fix genuinely cannot be verified without running the app, state exactly what runtime evidence is missing in issues — never claim it fixed on a compile alone.

Where two findings describe the same defect, fix it once. Do not address nits. Do not create git commits.

Test scope: the single covering test or spec file per finding is the ceiling. Re-run only that after a failed attempt — never the feature-wide or full suite.

## Output
The four lists together must account for EVERY finding above — one bucket each, nothing dropped.
- fixed: "{finding} — {what changed} — {how you verified the scenario}"
- rejected: "{finding} — STALE|UNREALISTIC|DUPLICATE — {evidence}"
- declined: "{finding} — {why fixing is not warranted} — {residual risk accepted}"
- planDeviations: "{finding} — {which plan clause vs which code reality} — {why fixing toward the plan's letter would be wrong}"
- status: SUCCESS unless you were unable to complete the repairs you committed to; filesChanged; summary; issues ("None" if none).`
}

// ---------- Phase: Validate ----------
phase('Validate')
let validation = 'SKIPPED'
let validationIssues = null
if (effectiveValidate === 'off') {
  log('validation off — reviewing the diff as-is (the implementer already ran the suite)')
} else {
  log(`validation: ${effectiveValidate}`)
  const v = await agent(validationPrompt(validationCommands, effectiveValidate), { label: `validation (${effectiveValidate})`, model: 'sonnet', phase: 'Validate', schema: AGENT_RESULT })
  validation = v?.status === 'SUCCESS' ? 'PASS' : 'FAIL'
  validationIssues = v?.issues ?? v?.summary ?? 'Validation agent died.'
}

// ---------- Phase: Code review ----------
phase('Code review')
let review = 'NOT RUN'
let reviewNits = []
let unresolvedFindings = []
let rejected = []      // adjudicator: not real
let declined = []      // adjudicator: real, deliberately unfixed — surfaced for the human
let planDeviations = [] // adjudicator: plan-vs-code conflicts — human decision, never auto-fixed
const fixedFindings = []
if (validation !== 'FAIL') {
  let fixed = 0
  let prevBlocking = Infinity
  const appliedFixes = [] // per round: what the adjudicator fixed and how it verified — r>=2 re-checks each against its scenario
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
      r = await agent(codexCodeReviewerPrompt(null, round, appliedFixes, rejected, planDeviations, declined), { label: `code review r${round}:codex`, model: 'haiku', phase: 'Code review', schema: CODEX_CODE_OUT })
      if (!r) { review = 'UNRESOLVED'; unresolvedFindings = ['Reviewer agent died.']; break }
      if (r.verdict === 'UNAVAILABLE') { review = 'UNRESOLVED'; unresolvedFindings = [`Codex CLI unavailable at code-review round ${round} — fixes not re-verified.`]; break }
    }
    reviewNits = r.nits ?? []
    const tag = () => {
      const bits = []
      if (planDeviations.length) bits.push(`${planDeviations.length} plan deviations escalated`)
      if (declined.length) bits.push(`${declined.length} declined`)
      return bits.length ? `; ${bits.join(', ')}` : ''
    }
    if (r.verdict === 'PASS') {
      review = fixed ? `PASS (panel, after ${fixed} fix rounds${tag()})` : `PASS (panel${tag()})`
      break
    }
    const blocking = r.blocking ?? []
    if (!blocking.length) {
      review = fixed ? `PASS (panel; no blocking findings, after ${fixed} fix rounds${tag()})` : `PASS (panel; no blocking findings${tag()})`
      break
    }
    // Convergence-aware stop, checked on what the PANEL reports (the adjudicator's
    // own fix count cannot detect a panel that keeps finding the same wall).
    if ((fixed >= 2 && blocking.length >= prevBlocking) || fixed >= 4) {
      review = 'UNRESOLVED'; unresolvedFindings = blocking; break
    }
    prevBlocking = blocking.length

    // ---- the adjudicator: one opus seat, judgement + repair ----
    const a = await agent(adjudicatorPrompt(blocking, round, rejected, declined), {
      label: `adjudicate r${round}`, model: 'claude-opus-5', effort: 'high', phase: 'Code review', schema: ADJUDICATOR_OUT,
    })
    if (!a) { review = 'UNRESOLVED'; unresolvedFindings = blocking; break }
    rejected.push(...(a.rejected ?? []))
    declined.push(...(a.declined ?? []))
    planDeviations.push(...(a.planDeviations ?? []))
    const justFixed = a.fixed ?? []
    fixedFindings.push(...justFixed)
    log(`adjudicate r${round}: ${justFixed.length} fixed, ${(a.rejected ?? []).length} rejected, ${(a.declined ?? []).length} declined, ${(a.planDeviations ?? []).length} plan deviations escalated`)

    if (a.status !== 'SUCCESS') { review = 'UNRESOLVED'; unresolvedFindings = blocking; break }

    // Nothing was fixed => the code is byte-identical to what the panel just read.
    // Re-reviewing it would regenerate the same findings, so stop here: every
    // finding is accounted for in rejected/declined/planDeviations.
    if (!justFixed.length) {
      review = `PASS (panel; round-${round} findings all adjudicated out, no code change${tag()})`
      break
    }
    appliedFixes.push(`Fix round ${fixed + 1} — findings fixed:\n${justFixed.map((f, i) => `  ${i + 1}. ${f}`).join('\n')}\nAdjudicator's account: ${a.summary}`)
    fixed++
  }
}

// ---------- Result ----------
return {
  status: validation === 'FAIL' ? 'VALIDATION_FAILED' : 'COMPLETE',
  planPath,
  validate: effectiveValidate,
  validation,
  validationIssues,
  review,
  unresolvedFindings,
  // Real defects nobody repaired — these need a human read, not just the summary line.
  declined,
  planDeviations,
  fixed: fixedFindings,
  rejected,
  nits: reviewNits,
}
