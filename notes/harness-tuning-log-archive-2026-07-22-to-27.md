# Harness Tuning Log — run-review-flow reviewer panel

Rolling log of reviewer/panel evaluations and the harness changes they produced. One entry per evaluation session, newest first.

---

## 2026-07-27 (evening) — Ralph leg of the A/B on admin-financial-override: COMPLETE incl. live E2E; first cross-harness numbers, and the fairness defects a rerun must fix

Same feature, second harness: `ralph:ralph` consuming a `ralph:strategic-plan`-generated `SPEC/ACTIVE/0001-admin-financial-override/` (tasks.md derived from the spec the run-flow cycle had already hardened). Branch `ralph/0001-admin-financial-override`, 10 commits, all 18 tasks + 9-item Integration Checklist checked, including live-browser E2E (T-16 edit+audit+recompute with revert, T-17 reason-gating, T-18 portal token isolation, T-22 log page) against the real DB.

### Ralph numbers (actual billed costs from iter logs)

- Session 1 (17:26, Opus 4.8 — accidental, see defects): 6.7m, $1.21, died on `Response stalled mid-stream` after task 1.1; ralph.sh treats nonzero exit as fatal, no retry.
- Session 2 (17:37–18:32, Sonnet 5): 55m, ~$20.3 (iter-1 log lost to the overwrite bug; ~$2.7 estimated), 7 iterations, phases 1–7.2. Iterations 2–6 skipped DB tests on a false "no VPN" belief; iter 7 self-corrected (17/17 mocha incl. live DB) and measured the bundle gate against the true pre-branch baseline (847 B < 2 KB).
- Session 3 (18:44–19:00, Sonnet 5): 15.7m, $8.22, 173 turns — E2E. Self-discovered ambient servers were serving the dev checkout not the worktree (`/proc/<pid>/cwd`), swapped/restored them; self-copied gitignored `backend/.env` (redacting values before reading key names).
- **Total: ~78 min active, ~$29.7, ~254k output / ~57M cache-read.** Human gaps: 4m restart + 12m `just e2e-auth` ADFS capture.

### Cross-harness comparison (run-flow data: subagent token audit, script at scratchpad `analyze.py`; rates back-solved from Ralph's billed costs, reproduce session 1's $1.2059 exactly)

| | run-flow total | run-flow shipped run only (run 6, stall-corrected) | Ralph |
|---|---|---|---|
| Active compute | ~7.4h, 9 workflows, 114 agents | ~2h05m | ~1.3h |
| Output tokens | 1.44M (1.62M incl. attended) | ~452k | ~254k |
| Est./actual cost | ~$103 (~$122 all-in) | ~$45 incl. orchestrator share | $29.7 |

Delta attribution, ranked: (1) ~55% of run-flow spend predates run 6 — run 1 built the feature, user manual testing found the disbursed-amount dialog bug, full revert + spec re-refine; runs 2–5 aborted during live harness tuning. (2) QA architecture: run 6's plan-review panel + live-validation workflow + code-review panel + 2 fix rounds ≈ the $15 run-6-vs-Ralph gap; those stages caught 4 real bugs (version-select, TS2554 regression, duplicate-audit, cancel-race). Ralph has zero independent review — its only QA is self-written tests + its own E2E. (3) Opus orchestrator residency ≈ $27 vs Ralph's $0 bash loop. (4) Model mix: ~$46 of run-flow is deliberate Opus; Ralph ran Sonnet by accident. (5) Ralph second-mover advantage: pre-settled decisions in context.md/tasks.md, files-touched list, bundle-gate method, plus a hand-copied auth state.

### Verdict status

Not adjudicable yet. Run-flow's build failed *human manual testing* (the revert); Ralph's build has not faced that test. If Ralph's build survives the same manual pass, cheap-harness wins this feature; if manual testing finds a panel-class bug, the QA premium pays for itself. User decision: **rerun both for a fair A/B.**

### Fairness defects the rerun must fix (all evidenced tonight)

1. **ralph.sh pins no model** — inherits CLI default (Opus 4.8 → Sonnet 5 mid-experiment). Pin explicitly; match or document vs run-flow's mix.
2. **Second-mover contamination** — both legs must start from the same spec state with no carried context.md learnings; ideally alternate order or use a different feature per leg.
3. **Worktree local-state gaps** (3 hit in one evening): skip-worktree'd `backend/tp/api/controllers/securityAdfsController.js` (local DRS bypass — E2E login only worked because cookie replay skipped the pristine controller's login path), gitignored `backend/.env`, gitignored `frontend/e2e/.auth/admin-state.json`. Proposed (not yet approved): ralph.sh sources `$PROJECT_ROOT/.ralph.env`; worktree-setup step propagates `git ls-files -v | grep '^S'` files + a declared runtime-file list.
4. **ralph.sh clobbers `ralph_claude_iterN.log` across sessions** — session 2 iter-1 economics unrecoverable. Timestamp the filenames.
5. **No retry on transient API errors** — `Response stalled mid-stream` killed session 1 ($1.21) and, same evening, an unrelated analysis subagent. One retry on nonzero exit with an api-error marker would have saved the session.
6. **QA parity**: decide whether the Ralph leg is scored as ralph-alone or ralph + `review-flow-only` appended — otherwise the harnesses ship different assurance levels and cost isn't comparable.
7. Post-run state: Ralph's restored dev servers died with its session (background children); report said "restored as found" — true at exit, false one process-exit later. Restoration must be user-owned or verified post-exit.

Raw data: `worktrees/0001-admin-financial-override/.runs/0001-admin-financial-override/` (iter logs 2–7 + session-3 iter1; progress jsonl), run-flow token audit in this session's subagent transcript.

---

## 2026-07-26 (late night) — First run behind the full restructure: COMPLETE green, but 39% of wall-clock was a harness notification stall (`wf_1c75e5a5` → `wf_9d09eb2e` → `wf_c67d6c9a`, session `13a95cf0`, Opus 4.8 orchestrator)

10th run on admin-financial-override; first behind panel-every-round + 2-round cap + opus reviser + parse-plan.cjs + GAP_FILL, all at once. Spec → COMPLETE: 7/7 tasks, validation PASS, code review PASS, zero unresolved. Wall 16:56→21:13 (4h17m); actual compute ~2h05m. User complaint ("forever review, forever validation, mindless, repeated, stupid questions") evaluated live at completion.

### Wall-clock breakdown (CDT)

- 16:56–17:09 planner+parse+r1 panel → killed by corporate SSL outage (external; 2nd codex-outage fire, again handled honestly).
- 17:16–17:19 resume: r1 panel re-ran live (3m), workflow returned NEEDS_DECISION at **17:19:00** (proven: `wzv1g5zml.output` mtime).
- **17:19–19:00 — NOTHING RAN. 1h41m stall**: the finished result sat undelivered; task-notification reached the orchestrator at 19:00:31. No host suspend (kernel clock calibrated via the 17:14 getaddrinfo error), no agent activity, output file complete. CLI 2.1.220 failed to re-invoke on task completion for ~101 min. **Biggest single cost of the run — 39% of wall — and it's harness, not review.** Separate red flag same day: OOM-killer killed a 12.3GB CLI process at 15:25 (earlier session).
- 19:00–19:23 ASK #1 (TOP-500 audit cap) + user answer + args rebuild.
- 19:23–20:01 reviser+r2 panel (10m) → Execute 7/7 in waves (22m) → validation FAILED on a **real cross-task regression**: T5 added a required `editProvider` param to `TpTableBaseComponent`, `TableViewAdminComponent` (in no task's file list) still passed the old super() arity → TS2554. The DI-inheritance trap's sibling, caught by validation as designed.
- 20:01–20:02 orchestrator one-liner fix (sanctioned path followed correctly).
- 20:02–20:19 `review-flow-only` #1: full validation incl. live playwright → FAILURE, caught the native-`<select [value]>` version-dropdown data-integrity bug (real; admin could overwrite the wrong version).
- 20:19–20:28 orchestrator mat-select fix → fresh relaunch (single-agent workflow can't delta-resume).
- 20:28–21:06 `review-flow-only` #2: full validation again (13m) + panel + triage + 2 fix rounds → PASS. Fix rounds caught 2 more real bugs (duplicate-audit on version-switch, cancel-during-save race). Triage rejected 8 (dupes/unrealistic).
- 21:06–21:13 ASK #2 (audit DELETE grant) → DB inspection → DBA script → COMPLETE.

### Open-item evidence (lots of firsts)

- **Apply-and-proceed FIRED on its first run**: 4 residual findings applied at the 2-round cap (`planFinalUnverified`), run proceeded. Downstream caught everything real; no evidence a residual shipped broken. Watch item (a) partially answered — it fired, but the run stayed green; no reason yet to bump MAX to 3.
- **Opus reviser + 2-round cap**: plan review converged r1 panel → 1 NEEDS_DECISION + 8 determined → reviser + r2 → proceed. No REPEATs, no substitution defects.
- **parse-plan.cjs ferry**: clean, ~37s parse agent (was ~1–3 min).
- **Panel/triage/fixer economics**: re-verify runs are dominated by live playwright+DB round-trips (13–17m per validation pass), not review seats. User's "forever validation" = 3 full validation passes (1 in-pipeline + 2 post-manual-fix), each mandated by the post-manual-fix full-re-verify protocol — and each caught a real bug, so "mindless" is adjudicated AGAINST on output, but the full-rerun-per-manual-fix structure is the real repetition cost.

### The two AskUserQuestions, adjudicated

1. **TOP-500 vs "every override" (19:01, cost 23m)** — protocol-legal: run-flow.md's product-tradeoff exception, and it's literally the "which behavior end users see" case. But it's the 4th paid appearance of this audit-cap contract across runs, and the user experiences these as "stupid questions I shouldn't be dealing with." Lever options: record the now-made decision (keep TOP 500, relabel) in the spec's 🔒 Settled block (legitimate — it's a user decision, not a hand-fix); or tighten run-flow.md to always self-resolve + report in Decisions made (matches the user's autonomy philosophy; removes the exception entirely).
2. **Audit DELETE grant (21:07)** — asked BEFORE checking capability; `TPExpandedAccess` can't GRANT or DELETE, so the chosen option was unexecutable and the outcome (write a DBA script) was the same regardless of answer. Confirm-first on a shared-DB permission change is right in principle, but the ordering was wrong: verify capability → then present script + one confirm, no menu.

### Proposals (pending user decision)

- **Report/watch the notification stall** (CLI 2.1.220): if it recurs, add a run-flow.md fallback — after launching a Workflow, poll the task output file mtime if no notification within the expected phase duration. Also watch memory: the 12.3GB OOM kill suggests long orchestrator sessions can balloon.
- **Kill ASK #1's class**: settle the TOP-500 decision in the spec block, and/or drop the product-tradeoff exception from run-flow.md's NEEDS_DECISION branch (always self-resolve + report).
- **ASK-ordering rule**: capability check before any user question whose options depend on it.

### Follow-up changes (2026-07-27, user-approved, uncommitted) — repetition/cost levers from the wall-clock analysis

Deeper profiling on the user's two follow-up questions. (1) Why validation passes take 13–17 min: not the browser — the agent loop; ~50 playwright-cli invocations/pass at a model round-trip each (~5 min), 14–22 DB queries (~3–4 min), 3 ng builds incl. the T-15 base-revision rebuild (~2 min). The plan's Runtime Verification had 7 steps (only one happy-path; T-19 is full fault-injection with request interception) because TPV2 has no frontend unit layer — dialog behavior verification has nowhere else to live. (2) The user's anti-rerun rule (TEST_GATE) held where it applies: 13 mocha executions = 5× T4 authoring the suite (its own gate) + 1× per validation pass (pass-2's provably redundant — zero backend changes) + 5× fixers (TEST_GATE never bound fixers). Mocha is seconds-cheap; the expensive repetition is the browser flow + T-15 double-build re-paid per re-verify pass.

1. **Delta-scoped re-verify** (`review-flow-only.js`): new optional `changedFiles` arg — when the orchestrator enumerates the complete delta since the last full pass, the validation prompt gains a Delta-scope section: skip commands no changed file can affect (justify per-item), Runtime Verification mandatory for flows touching the delta + the manual fix's failure scenario, skippable with justification otherwise; expensive owned procedures (T-15 byte-compare) may reuse the prior pass's recorded result. Scope by affected BEHAVIOR, never by edit (the 07-25 wrong-component lesson). Success gate reads "every in-scope step". run-flow.md's post-manual-fix path (b) now documents `changedFiles` + the omit-when-incomplete rule.
2. **Fixer test-scope ceiling** (both scripts' fixerPrompt, lockstep): single covering test/spec per finding, re-run only after a failed attempt, never the feature-wide or full suite — re-review/validation re-prove the surface.
3. **Runtime Verification minimality bound** (all three plan templates): one happy-path step per user-visible flow/surface + compiler-invisible wiring/isolation proofs; a branch/fault-injection step must name the acceptance criterion no automated test in this repo can cover (bug.md anchors on the symptom's path + the regression test owning branch coverage; user asked for the bound on bug/chore too after feature.md shipped first). Deliberately NOT bounded to happy-path-only: T-19/T-20-class steps found real bugs (duplicate-audit, cancel race) this run.

Both scripts syntax-checked (async-wrapped `node --check`). Cache: fixerPrompt changed in run-review-flow.js → pre-edit run resumes bust fix-rounds-onward in code review (validation/panel/triage prompts unchanged there); review-flow-only.js prompts changed but it's launch-fresh by design. Zero runs behind all three — watch: (a) does the orchestrator enumerate `changedFiles` honestly or over-scope skips; (b) does a delta-scoped pass ever miss a real cross-boundary regression (e.g. frontend edit breaking a backend contract test — the skip rule's "can affect" judgment is the risk surface); (c) does the next feature plan's Runtime Verification section shrink.

---

## 2026-07-26 (night, latest) — Plan review restructured: panel EVERY round + 2-round cap + apply-and-proceed (`run-review-flow.js`, uncommitted; user-approved)

`wf_309ff903` (fresh run behind the opus-reviser change, entry below) proved the reviser was never the bottleneck: the opus reviser applied clean fixes with **zero REPEATs, zero substitution-contradictions, zero re-raised NEEDS_DECISIONs, count 10→2→1→1** — and the loop STILL didn't converge to PASS. Diagnosis: **reviewer-driven, not reviser-driven.** A single re-reviewer surfaces ~1 new genuine cross-task defect per round (r2 audit-body mismatch, r3 field_name logical-vs-physical, r4 GET/audit TOP-500 cap — all distinct, real), so a dense contract web (6 shared contracts §A–§F × 7 tasks) dribbles out over many rounds no matter how good the fixer is. Plus the orchestrator's NEEDS_DECISION resume reset the round counter → the run sailed past the old 4-round backstop (the recurring "relaunch resets convergence state" meta-loop). Opus-reviser timings confirmed real work (pin held: all 4 revisers on `claude-opus-4-8`, 37s for a single trivial finding up to 6m40s for the 12-finding batch — not rubber-stamping).

User's framing: "cut the number of reviews AND make each round more productive." The two are one lever — a single reviewer is *why* the loop needs many rounds; an exhaustive panel each round is what *lets* the cap drop.

### Changes applied (`run-review-flow.js` plan-review loop; syntax-checked, async-wrapped `node --check` stripping the `export` keyword)

1. **Panel every round, not just r1.** The loop now runs the 3-seat codex lens panel on every round (was: r1 panel, r≥2 single reviewer). r≥2 panelists get the `applied[]`+`knownNits` context (the prompt builder already threaded them). Exhausts the defect pool in one pass instead of dribbling ~1/round. Partial outage now degrades gracefully at every round (survivors proceed; all-down → FAILED).
2. **`MAX_REVIEW_ROUNDS` 4 → 2.** Safe *because* of #1: r1 panel → revise → r2 panel → (revise) → Execute.
3. **Apply-and-proceed at the cap (option A, chosen over keeping the UNRESOLVED bail).** At round 2 with determined findings still present, the reviser applies them ONE final time and the run **proceeds to Execute** — no UNRESOLVED_PLAN. Ends the orchestrator hand-off / round-budget-reset meta-loop that has caused ~half the never-ending-loop episodes. The final applied findings are surfaced as `planFinalUnverified` in the result (new field) so the orchestrator/user knows exactly what shipped without a verifying panel. Code review is the downstream net for any ripple.
4. **REPEAT stays the one bail.** A REPEAT (required fix demonstrably absent → fixes aren't landing) is unsafe to proceed on, so it keeps the grace-round-then-UNRESOLVED path. With MAX=2 a repeat first-seen at r2 bails immediately (no grace room) — acceptable: repeats should be near-zero with the opus reviser + no-substitution rule.

Net: **≤2 exhaustive panels, fully autonomous, hard-bounded**, vs. the old up-to-4-that-resets-on-resume. Cost trade: +2 codex seats/round, far fewer rounds — expected net token/wall drop and, more importantly, a bounded ceiling.

### Open items

- **Zero runs behind all of it.** Watch the next fresh run for: (a) does r2 panel actually clear the pool (few/no r2 determined) or does apply-and-proceed fire routinely — if it fires every run with real cross-task findings, MAX=2 may be one round too tight (bump to 3); (b) does code review catch the `planFinalUnverified` ripples, or do they reach delivery; (c) per-round cost with 3 seats every round vs. the round savings.
- **run-flow.md not yet updated** (flagged to user, not auto-edited): UNRESOLVED_PLAN is now rare (only reviser-failure or surviving-REPEAT), and Step 4's report doesn't surface `planFinalUnverified`. Decide whether to update the orchestrator doc.
- Proposal 2 (reviser autonomy) still held — but note the reload seam recurring r1→r2→r3 even on opus is live evidence that point-fixes-under-binding-resolution can't reconcile an interlocking web; revisit if apply-and-proceed keeps shipping reload-class ripples.

---

## 2026-07-26 (night, later) — Plan reviser upgraded sonnet → opus (`run-review-flow.js`, uncommitted; user-approved)

User's diagnosis of the never-ending plan-review cycle: we've been fixing the wrong lever. The **plan reviser** — the agent that applies findings — ran on sonnet while the planner ran on opus, which is backwards: revision is the harder job (hold a finding + its exact resolution mechanism + the live codebase + the whole plan's contract web at once), and it's where the loop actually breaks. Evidence from this log supports it: every documented reviser-caused non-convergence was the sonnet reviser — `wf_ead81b27` (substituted its own mechanism for the reload seam → self-contradictory §F → abort), `wf_2677abe5` (applied a decision at one line, missed the contradicting instance at another → REPEAT), `wf_e87d6402` (wrote a false codebase claim, JWT expression misattributed across files). Three prompt-level guardrails (binding-resolution rule, claim-verification rule, grace round) were bolted on to compensate for reviser weakness and the cycle still recurred.

- **Change**: all three `planReviserPrompt` spawn sites (decision-resume reviser-first, repeat-grace, normal round) `model: 'sonnet'` → `model: 'claude-opus-4-8'` (pinned literal, not `'opus'` — broken-alias memory `opus-alias-broken-2-1-219`). Model-policy comment updated: opus = planner + plan-reviser; sonnet = implementer/retry/validation/triage/code-fixer. Syntax-checked (async-wrapped `node --check`, stripping only the `export` keyword — `sed '1d'` orphans the meta object).
- **Scope**: plan reviser only. The code-review fixer, triage, implementer, and validation stay sonnet — user's concern was specifically the plan-review cycle.
- **NOT done — proposal 2 (more reviser autonomy), deliberately held.** User felt weaker about it and agreed to one-variable-at-a-time: the binding-resolution rule (no mechanism substitution) exists *because* the sonnet reviser substituted a mechanism (`wf_ead81b27`); loosening it the same moment we change the model removes a failure-justified guardrail and confounds attribution. Revisit only if the opus reviser is visibly hamstrung — e.g. it identifies a better seam mechanism but is forced to dump it in `issues` because the finding's stated resolution was suboptimal (concrete case = the evidence to loosen).

### Live state when this landed: `wf_96430e35` (session 4d63af87), 9th run on admin-financial-override, still in plan review r2

Evaluated mid-run. r1 panel (post-NEEDS_DECISION resume, reviser-first) → r2 single reviewer surfaced **2 determined, 0 needsDecision, 0 nits** — both the chronic contracts, and both genuine plan-internal coherence gaps (checked against the tech-spec 🔒 block; neither is a settled item illegitimately re-raised):
1. **Reload-across-the-seam contradiction** — `RowEditProvider.openEditor(row, model): void` has no return channel, yet SC-6/settled block require the dialog to "emit a committed-change result" that triggers the table reload. This is exactly the seam `wf_ead81b27`'s sonnet reviser botched.
2. **Atomicity/rollback has no verification path** — SC-7 claims atomicity "proven end-to-end" but SC-4's rollback invariant can't be forced (no way to drive a zero-row UPDATE).
- This edit does NOT affect `wf_96430e35` (runs its persisted pre-edit copy) — opus reviser takes effect on the next launch only.

### Deeper root cause flagged, then DECLINED (correctly) by the user

I proposed hand-fixing the spec seam (`openEditor(): void` has no return channel for the committed-change result the settled block requires; the planner re-injects the contradiction every re-plan). **User rejected it on principle, and was right:** (1) opus is capable enough to resolve the gap per-run; (2) the harness MUST be robust to imperfect specs by design — if convergence depends on a human hand-correcting each spec, the pipeline isn't resilient, it's outsourcing its hard job to spec-curation that will never be perfect, and re-introducing exactly the manual-escalation dependency the autonomy boundary forbids. The opus reviser IS the protection against spec defects; paying a review round to re-derive and fix a gap is the *cost of resilience*, not a defect to design away. Do NOT hand-patch specs to force convergence. (General version of the idea — persisting reviewer-derived resolutions across re-plans so the cost isn't re-paid every launch — remains a possible future lever but is a bigger design question, not pursued now.)

### Open items (refreshed)

- **Opus reviser: zero runs behind it.** Watch the next launch for (a) whether r≥2 rounds shrink — does the opus reviser resolve the reload seam without creating a contradiction (the `wf_ead81b27` failure mode); (b) whether reviser-introduced defects (false claims, missed instances, mechanism substitution) drop; (c) reviser wall/token cost delta (1–3 calls/run, small vs. a full gated round); (d) whether it starts reporting genuine resolution conflicts in `issues` rather than forcing a bad fix — that's the signal that proposal 2 (autonomy) is worth reopening.
- Seam-in-spec durable fix: DECLINED on principle (above) — do not re-propose hand-fixing specs to force convergence.
- All prior-entry open items still stand (parse-ferry fidelity, ADVISORY channel, plan-severity floor, GAP_FILL watch).

---

## 2026-07-26 (night) — Parse phase: deterministic `parse-plan.cjs` replaces the haiku model parse (`run-review-flow.js` + new `workflows/parse-plan.cjs`, uncommitted)

User-requested change, iterated twice in one session. v1 (haiku echoes the raw plan → JS parses in-script) shipped and immediately proved WORSE on latency: the echo ferried the whole 40–47KB plan through haiku (~12k output tokens, ~3 min on `wf_7ccc4fae` — vs ~1 min for the old model parse). User called it out. Root constraint verified by live probe (`wf_29f6c466`): the workflow sandbox has NO `fs`/`require`/`process`/`fetch` and `eval` is blocked — every byte entering a script goes through some model's output, so "free" in-script file reading is impossible. v2 minimizes the ferry instead:

- **Parser is a real Node script** — `~/.claude/workflows/parse-plan.cjs` (single source of truth, runs in ~30ms): regex extraction against the pinned template structure, internal validation (unique `T\d+` ids, non-empty title/what/doneWhen, deps resolve), prints `{ok:true, tasks:[{id,title,files,dependsOn}], validationCommands}` or `{ok:false, reason}`.
- **The Parse-phase haiku agent is now a ferry**: runs the script via Bash and copies its ~1–2KB skeleton JSON verbatim (~300–500 output tokens, seconds of model time — wall time is agent spawn). It falls back to model extraction (same slim shape) only when the script prints `ok:false`; a second-layer model-parse agent fires only if the returned skeleton fails the in-workflow `validateParsed` gate.
- **PARSED schema slimmed to the skeleton** — what/tests/doneWhen dropped. They existed only to be pasted into implementer prompts, but implementers read the full plan anyway (by design, user-confirmed 07-24); `implementerPrompt` now points at the task's `### T{N}:` plan section as the verbatim authority instead of embedding a copy. Files stays embedded (parallel-sibling discipline needs it).
- **Files-field resolver** handles the three shorthands real plans use: directory listed once + bare filenames, bare filenames inheriting the previous full path's directory, `.html`/`.scss` extension fragments. Any unresolvable token → whole field `[]` (task runs alone; never false-disjoint parallelism). Verified: admin-financial-override resolves all 7 tasks fully, T6∥T7 disjointness preserved.
- **Corpus check: 28/29 historical TPV2 plans parse and validate**; the one `ok:false` (`progressive-dot-loading-maplibre-2026-07-08.md`) has no `### T{N}` headings (pre-template) — correct fallback behavior.
- **Cache note:** parse prompts AND implementer prompts changed — resuming any pre-edit run re-runs parse and every Execute task live. `wf_7ccc4fae` (in flight) runs its persisted v1 copy: its parses stay slow-echo; do not resume it against the new script mid-Execute.
- Syntax-checked (async-wrapped `node --check`). Watch the first run for: ferry fidelity (does haiku copy the JSON without editing), fallback firing on a conforming plan, and whether implementers behave identically without the embedded What/Tests/Done-when (they still get Files + the section pointer).

---

## 2026-07-26 (evening) — `wf_e87d6402` plan-review cycle re-diagnosed mid-run: coordination-channel severity floor + advisory channel + resume context fix (session `d22b69ea`, orchestrating session `d1575832`)

8th run on the admin-financial-override spec (fresh practice relaunch, spec input, new Opus plan). User report: "same vicious time and token wasting review cycle." Evaluated live at ~30 min in: r1 panel 16 findings → 9-min sonnet revise → r2: 1 new determined → revise → r3: 1 new determined + 1 NEEDS_DECISION → full stop → orchestrator auto-resolved (protocol-clean, spec-grounded) → resume reviser-first → post-resume re-review PASSed → Execute (progressing normally at eval end; plan review total ~35 min, zero nitpicks).

### Adjudication of "fixer is stupid vs reviewer is a nitpicker": neither, on transcript evidence

- **r2's JWT finding was fixer-introduced**: `TP_JWT_SECRET || 'secretkey'` appears nowhere in the planner output; the r1 reviser read `adfsTest.js` (which really uses that expression) and attributed it to `security.js` (whose `verifyToken` hardcodes the literal). Real defect, born in a fix, caught one round later. First confirmed fix→new-defect in PLAN review (known signature in code review).
- **r3's HMGP finding was an original planner defect missed twice**: unconditional `SELECT rowKeyCol, versionCol` sits verbatim in the planner output next to `versionColumn: null`; 3 r1 seats + the r2 reviewer missed it. Sampling, not nitpicking.
- **r3's NEEDS_DECISION (partial-success refresh) is the 3rd paid appearance of the same contract** (wf_ead81b27 REPEAT abort, wf_0405da73 code-review r2, now) — a genuine spec gap re-derived on every re-plan because no document records the resolution.
- Structural read: reviews sample, they don't exhaust — and the loop priced every late catch at a full gated round (~7–10 min). The user's key question reframed the floor: most singleton findings are ones the implementer would collide with and self-correct (JWT: tests pass anyway; HMGP: first run breaks, GAP_FILL licenses the fix). What implementers CANNOT self-correct is cross-task divergence — parallel fresh contexts share nothing but the plan.

### NEW defect: mid-loop NEEDS_DECISION wipes loop context on resume

First-ever r≥2 NEEDS_DECISION pause exposed it: the resume path (`decisions.length` branch) rebuilt `applied` from only decisions+carriedFindings — the 17 previously-applied resolutions and all knownNits vanished from the re-reviewer's context (re-litigation + nit-escalation risk; this run's post-resume round happened to PASS anyway).

### Changes applied (2026-07-26 evening, user-approved after discussion, uncommitted)

1. **`PLAN_SEVERITY_RULE` (coordination-channel floor) on ALL plan-review rounds** (`run-review-flow.js` r1 lenses + r≥2; mirrored as "Coordination floor" in plan-review.md Classify): blocking = cross-task incoherence OR ships-silently; a single-task defect its implementer will directly collide with (broken SQL, impossible gate, factual claim the first compile/test disproves) is a nit prefixed `ADVISORY(T{N}):`. Replaces the r≥2-only "implementer produces broken work" floor (too broad — locally-broken work self-heals). Chosen over the 07-25 gate-cutting restructure proposal: reduces rounds by reclassifying, not by not looking.
2. **Advisory channel**: `ADVISORY(T{N})`-prefixed nits from any round ride into that task's implementer/diagnostic prompt ("Known plan inaccuracies… the code is the authority"), surfaced as `planAdvisories` in the result. Prompt renders empty when none → Execute cache preserved on old-run resumes without advisories.
3. **Reviser claim rule** (planReviserPrompt + plan-review.md Step 2.2): no NEW factual claim about the codebase without verifying the exact cited file — quote the verified line in the summary; unverifiable → issues. Kills the JWT class at the source.
4. **NEEDS_DECISION resume context fix**: the stop now returns `appliedResolutions` + `knownNits`; the resume branch re-seeds both from args; run-flow.md tells the orchestrator to pass them back verbatim.
5. **Spec-side (TPV2, biggest lever for the practice loop)**: "🔒 Settled decisions" block appended to `admin-financial-override-tech-2026-07-24.md` — sequential POSTs + rebaseline-on-partial-failure + committed-change-result reload contract, trimmed-reason ≤1000, strict amount parsing, HMGP null-version handling. Planners/reviewers must not re-raise these.

Syntax-checked (async-wrapped `node --check`). Cache: r1 panel + r≥2 reviewer + reviser prompts changed → resuming any pre-edit run re-runs plan review live from r1 (planner/parse still cached); Execute prompts byte-identical when no advisories exist.

### Open items (refreshed)

- All five changes: zero runs behind them. Watch the next run for (a) whether ADVISORY-prefixed nits actually appear and ride into the right task prompts, (b) whether blocking counts drop without real cross-task defects leaking to Execute, (c) whether the reviser's summaries start quoting verified lines, (d) whether a fresh plan from the updated spec still raises the partial-success conflict (it must not).
- Deferred with rationale: extra grounding lens in r1 and diff-scoped r≥2 reviews — most of what they'd catch is advisory under the new floor; revisit if rounds don't shrink.
- Triage counterfactual-test-value blind spot; GAP_FILL watch; 07-23 leftovers (byte-identical resume args note is now partly addressed by run-flow.md's verbatim-args wording; foreground-timeout rule in task prompts still pending).

---

## 2026-07-26 (later) — `wf_0405da73` COMPLETE end-to-end: first live exercise of the triage gate, UNFIXED-trace, and disputed-findings block (session `c8f40489`)

Resume after the repeat-stop: user hand-applied the T6/§F + whitespace-validator plan fixes, relaunched with `skipPlanReview:true`. 60 min, 19 agents, 1.32M tokens. 7/7 tasks COMPLETED (waves T1∥T5 → T2 → T3 → T4∥T6∥T7), validation PASS (real DB, full backend suite), code review **PASS (panel; round-3 findings all triaged out, after 2 fix rounds)**. First fully-green run on this feature — and the first run behind the 07-25 code-review changes.

### Triage gate: earned its seat on first firing

- **r1: 12 raw panel findings → 5 confirmed, 7 rejected** (3 UNREALISTIC, 4 DUPLICATE). The kills were *grounded*, not vibes: the no-UPDLOCK/stale-oldValue findings (2 seats) rejected by citing the plan's explicit last-writer-wins acceptance (plan line 264); the T-13 `rowId:1` authz findings rejected by tracing middleware order (`security.authorize` short-circuits 401 before body read); coverage-by-deletion rejected via the plan's own runtime-verification gating (line 268). These are precisely the concurrency/rigor findings that burned fix rounds 3–4 and the backstop on `wf_e23038b7`.
- **r2: 3 → 2 confirmed** (rejected: `Infinity`/`1e309` numeric edge). **r3: 1 → 0 confirmed** (bundle-baseline artifact untracked — rejected: `SPEC/` is a pre-existing repo-wide `.git/info/exclude` entry) → PASS. Trajectory 12→5→3→2→1→0 in 2 fix rounds vs the pre-triage run's 16 → 5 fix rounds → UNRESOLVED with 3.
- **Watch item:** the T-13/T-214 rejections judged *current reachability*, but the findings' value was counterfactual (a weak regression guard if authz were ever removed). Consistent with the plan's runtime-verification philosophy, but triage may systematically kill test-hardening findings; acceptable for now, keep an eye on it.

### Plan-review pain converted into caught code defects

Both contracts that wouldn't converge this morning did real work in code review: r2 flagged the dialog's partial-save reconciliation for contradicting §F's "failed/cancelled dialog must not emit fullReload" (the exact REPEAT contract), and r2 caught `Validators.required` accepting whitespace-only reasons — the very determined finding from plan-review round 2 — fixed with a `requiredTrimmedValidator`. The whitespace→`Number('  ')===0` amount bug (unresolved leftover from `wf_e23038b7`) was confirmed r1 and fixed. Fix r1 also deleted the out-of-scope migration file (3/3 panelists flagged it) and completed the T-15 bundle delta (+0.19 kB transfer, well under the ~2 KB gate).

### Residuals for the user

- Validation flagged a spec/live mismatch (not a regression): §E cleanup step 4 (`DELETE FROM financial_override_audit`) is impossible under live grants (SELECT+INSERT only, append-only by design); leftover dev/test audit rows from earlier sessions exist.
- 1 open nit: `financial-override.service.ts:9` types `rowId` as `number` but HMGP's ProjectNumber is a string — worth a manual look, HMGP path may care at runtime.
- Execute-phase discoveries: populated again (3–7 per task, all 7 tasks).

### Follow-up change (2026-07-26 afternoon, `run-review-flow.js`, uncommitted): GAP_FILL rule in implementer prompts

User-found defects on the delivered feature: the dialog's version picker rendered rows in storage order (no ORDER BY; plan/spec never stated an ordering) and the dialog fonts rendered ~10px (global `html{font-size:10px}` shrinks Material's rem tokens; sibling dialogs compensate via admin wrapper classes, the fresh wrapper didn't). Neither is catchable by the loop: no written contract violated (reviewers enforce only what's written — correctly, per the anti-invention tuning) and no visual oracle exists. Root cause: implementers treated **plan silence as "anything goes"** and shipped the path of least resistance.

Change: a universal `GAP_FILL` block ("Plan silence is not a specification") added to `implementerPrompt` + `diagnosticPrompt` — where the plan is silent, supply the self-evident senior-dev choice and prefer the surrounding codebase's existing solution; note gap-fills in the summary; never override what the plan states. Implementation-time mirror of the reviser's binding-resolution rule; deliberately NOT added to any reviewer/triage prompt (review-side invention is the non-convergence engine). Kept universal per user constraint — no project/UI-specific rules in the harness. Rejected: a planner must-state-sort-order rule (the "specify every detail" treadmill, relocated). The picker itself was fixed by hand (ORDER BY versionColumn in `getSourceRows`, 13/13 mocha green, nodemon live-reloaded); fonts accepted as-is by the user. Zero runs behind GAP_FILL.

### Open items (refreshed)

- Repeat grace round + REPEAT-classification + binding-resolution reviser rule (this morning): still zero runs — this run skipped plan review entirely.
- GAP_FILL implementer rule (above): zero runs; watch the next run's summaries for noted gap-fills, and whether reviewers stay quiet about them.
- Triage counterfactual-test-value blind spot (above).
- Still pending from 07-23: run-flow.md byte-identical resume args; foreground-timeout rule in task prompts.

---

## 2026-07-26 — Repeat-stop postmortem: one-strike REPEAT rule aborts a converging loop (`wf_ead81b27`, session `c8f40489`)

Sixth terminal stop on the admin-financial-override spec since 07-25 afternoon. This one died at plan-review round 2 with `UNRESOLVED_PLAN` ("resolutions did not stick") while the loop was **converging: 16 blocking findings → 2** (1 new determined + 1 REPEAT). The one-strike repeat rule at `run-review-flow.js` turned that single REPEAT into a full abort with a "re-plan or split" diagnosis that didn't fit.

### What actually happened (evidence-verified against the plan file)

- Reviser-first resume (1 user decision + 15 carried findings) → Sonnet reviser reported all 16 applied → codex round-2 re-reviewer returned 1 determined (whitespace-only `reason` validator — real, small) + 1 REPEAT (T6/§F refresh channel).
- **The REPEAT was textually correct, and the reviser caused it.** Carried finding: "make the table consume successful dialog completion through its reload path." The reviser — grounding in the live codebase — found `TableViewService.fullReload` and **substituted its own mechanism**, writing §F so the *provider* emits "after all changed-field POSTs succeed … before/as the dialog closes" while T6 gives the *dialog* ownership of the POSTs, and explicitly adding "no dialog-result subscription … is needed." The provider has no stated way to learn of POST success — self-contradictory as written. Codex's "required edit demonstrably ABSENT" call was accurate in the letter.
- Same signature as `wf_2677abe5` (07-26 00:33): reviser applied the onboarding decision at line 203, missed the contradicting instance at line 18 → REPEAT → abort. **Both observed repeat-stops are reviser misses (substitution / missed instance) on converging loops, not overloaded tasks** — the failure mode the one-strike rule was designed around has not been the one firing.
- Yesterday's three 4-round-backstop stops (`wf_bf177017`, `wf_2bd2110a`, `wf_f72ce22c`) were the test-machinery-bundled-in-tasks pattern; planner rule 4 + the smaller 7-task plan fixed that class — those findings are gone from today's rounds.
- User perception "codex continues to be a pain" — adjudicated **against** on this evidence: both repeat calls were correct; the harness policy (one codex classification → instant abort, no second opinion now that all seats are codex) is what amplified them.

### Changes applied (2026-07-26, `workflows/run-review-flow.js` + `commands/exec/plan-review.md`, uncommitted)

1. **Repeat grace round** (`run-review-flow.js` plan-review loop): a first REPEAT no longer aborts — repeats go back to the reviser as verbatim-apply instructions ("PREVIOUSLY REQUIRED, STILL ABSENT — apply this RESOLUTION verbatim … delete any earlier edit that contradicts it"), with the same round's determined findings riding along so they aren't lost. Only a repeat that survives its own targeted grace round — or one reported at the 4-round backstop — aborts. `repeatGraceUsed` flag, one grace per run.
2. **REPEAT classification guidance** (re-reviewer `appliedNote`): an edit that WAS made but is defective/incomplete/uses a different mechanism must be reported as a NEW determined finding with its own resolution, NOT a REPEAT — REPEAT is reserved for items where no edit was attempted at all. (Today's case would then have converged at round 3 with no grace round needed.)
3. **Binding-resolution rule for the reviser** (both `planReviserPrompt` and plan-review.md Step 2 instruction 2): a finding's RESOLUTION mechanism is binding — no substituting an "equivalent" design, even one grounded in the live codebase; a genuinely wrong/impossible resolution gets left unapplied and reported in `issues`, never redesigned silently.

### Open items / cautions (refreshed)

- All three changes: zero runs behind them. Watch the next repeat for (a) whether the grace round converges it, (b) whether codex now files applied-but-defective as determined, (c) whether the reviser starts reporting resolution conflicts in `issues` instead of substituting.
- The tuning-log statement "round-2+ single reviewers stay Opus" is stale — since e282ed2 round 2+ is codex (haiku wrapper) too. All review authority is now codex; a repeat-verification second opinion remains a fallback option if grace-round tuning proves insufficient.
- The plan itself (`admin-financial-override-plan-2026-07-26.md`) still carries the T6/§F contradiction + the whitespace-validator finding + 2 nits — hand-fix and resume with `skipPlanReview`, or re-run plan review under the new rules.
- Still pending from 07-23: run-flow.md byte-identical resume args; foreground-timeout rule in task prompts (`wf_ea848751` has long terminated — both are now safe to apply).

---

## 2026-07-25 (late night) — Delivery-failure postmortem: all-green pipeline, feature never wired (admin-financial-override, session `90821e53`, runs `wf_2677abe5` → `wf_d6d0d013` → `wf_e23038b7`)

The pipeline reported implement ✓, validation PASS, 20+ review findings fixed across 4 fix rounds — and the user opened `/en/financial-analysis/table-view/pa-obligated-in-construction-or-completed` in tp-admin and found **no Edit button**. The feature the plan is named after never rendered. Root defect: `TpTableComponent` subclass constructor drops the inherited `@Optional() @Inject(EDIT_PROVIDER_TOKEN)` param when calling `super()` — valid TS (param defaults to `null`), Angular doesn't inherit constructor DI decorators, so injection silently yields null. Invisible to tsc/ng build by construction. User fixed it manually via the orchestrator.

### Timeline

1. `wf_d6d0d013`: implement waves ✓ → validation FAIL (real cross-task regression: root-scoped Mocha hooks in `financialOverride.validation.test.js` leaking across the combined run) → **code review skipped by design** (`review: NOT RUN`), status VALIDATION_FAILED.
2. Orchestrator fixed the test inline, then **fell back to `exec:review-loop`** — a single Claude reviewer — instead of re-entering the workflow's codex panel. Compounding: the reviewer requested `model:"opus"` and actually ran on **sonnet-5** (broken-alias bug, memory `opus-alias-broken-2-1-219` — first confirmed in-the-wild hit). Stopped before finishing.
3. Resume attempt (`resumeFromRunId: wf_d6d0d013` + cache-busted validation prompt): wave-1 replayed, but **wave-2+ implement prompts cache-missed** — the carried-discoveries block (fd72201) embeds discoveries in wave-*completion* order, which replay can't reproduce. T3/T8/T11/T4/T6 re-ran as (harmless, idempotent) verify passes; user stopped it; manual fix survived untouched.
4. `wf_e23038b7` (`review-flow-only.js`, standalone Validate+Code-review extraction — see Artifacts below): validation PASS → panel r1 **16 blocking** (~9 unique; every seat contributed unique finds, 2 defects found by all 3 — panel diversity value confirmed) → 3 → 2 → 1 → r5 rose to 3 → **backstop → UNRESOLVED** (whitespace-accepting validator, frontend `Number()` precision loss, T-06b still committing real seeded data). Orchestrator treated it as review-resolved and reported done.
5. User manually tested the UI → no Edit button → orchestrator hand-fixed wiring (`table-view-admin.component.ts`, `tp-admin-app.module.ts`, tp-table files; uncommitted).

### Root causes

1. **No runtime gate anywhere in the loop.** The only tests that render the page and click the button (T-16/T-17) require `E2E_ADMIN_STORAGE_STATE` (a real MODIFY login fixture) that has never existed in this env. T10 reported SUCCESS declaring "T-16/T-17 correctly skip (not error)" — an implementer certifying an acceptance test it never executed. Everything that DID run was static or below the UI: backend mocha (API-level), tsc/build (can't see dropped DI decorators), T-18 (asserts *absence* of portal edit UI — passes harder when nothing is wired).
2. **The panel caught it TWICE and the pipeline still lost it.** r1 panelist 3: "TableViewAdminComponent neither injects nor passes EDIT_PROVIDER_TOKEN … no Edit button is rendered" — but the fixer wired that named component, which is NOT what the route renders, and its verification contract ("verify what you changed" = tsc/build) let the wrong fix pass as fixed. All 3 panelists flagged the E2E silent-skip; the fixer made it fail-loud; nobody ever ran it loud. Detection was fine; **fix verification is as static as the reviewers**, so a static-invisible defect survives even after being found.
3. **The plan buried the runtime gate in a comment.** Validation Commands lists the Playwright run as `# Frontend E2E …` — a comment. Both the workflow's validation agent and the standalone rerun faithfully executed only the 5 concrete commands. A gate that isn't a command doesn't exist.
4. **Static review skews exotic-but-provable over basic-but-runtime-only.** Codex proved races and precision loss from text (rigorous, cheap) while "does the route reach this code" is unprovable without running. The user-visible symptom — concurrency nitpicks while the button was missing — is modality, not reviewer quality. Fix rounds 3–4 were burned on the plan-mandated concurrency test (didn't prove ordering → improved version committed real data → STILL in the final unresolved 3). That mandate entered via plan-review carried findings; nothing downstream is empowered to push back on YAGNI grounds.
5. **Same trap, third sighting, still shipped.** The `TableViewAdminComponent`-has-its-own-template trap was caught in plan review on 07-25 morning (`wf_2bd2110a` r4) and again by this panel — the retracted TPV2 planning-note proposal was retracted on "the panel catches it every time"; true, and insufficient: catching ≠ delivering when fix verification can't see rendering.

### Artifacts (scratchpad, session `d07c2fb6` — /tmp, lost before recovery)

- `review-flow-only.js` — standalone Validate+Code-review workflow. Scratchpad copy lost; **recreated 2026-07-25 as permanent `~/.claude/workflows/review-flow-only.js`** (see Changes applied), prompts kept in lockstep with run-review-flow.js.
- `run-review-flow-revalidate.js` — one-off cache-bust resume copy (obsolete: discovery ordering fixed).

### Changes applied (2026-07-25, user-approved after re-examination, uncommitted) — postmortem response

User's requirements: (1) fewer unrealistic codex nits, (2) the Edit-button class caught by REVIEW, not necessarily e2e, (3) playwright-cli over authored `.spec.ts` e2e. Design principle stated by user: **the spec is the decision boundary — every user decision is captured at spec time (interactively); once the pipeline runs it is fully autonomous, nothing escalates mid-run.** So scope disputes resolve against the spec, never via AskUserQuestion.

Re-examination correction to the postmortem's own framing: only 1 of the 4 gaps was truly runtime-only. The finding was mis-anchored to a component the route doesn't render, the fixer's contract was compile-only ("Verify ONLY what you changed"), and code r≥2 reviewed the diff cold with no prior-findings context. Three static fixes + one runtime gate:

1. **Realism floor (`REALISM_RULE`) on every codex seat** — plan r1 lenses, plan r≥2, code r1 lenses, code r≥2 (`run-review-flow.js`), plus at the source: review-loop.md Step 1 item 6 and plan-review.md's Classify section. Blocking requires a scenario reachable by a realistic actor through actual entry points; unrequested rigor machinery (locks/concurrency proofs/fault injection/precision) is a nit — the spec is the authority on rigor. (Old floors filtered vagueness, not implausibility — codex can always construct a concrete scenario.)
2. **Triage gate ("reevaluator" seat — user's design, chosen over fixer-dispute and over more orchestrator power)**: new sonnet agent between panel merge and fixer, both workflows. Re-verifies each blocking finding against CURRENT code (kills stale reports — the wf_760d1b0d 8-of-9-false round; closes that entry's "code-review false-positive control" open item by restoring review-panel.md's dropped verify-before-fix step) and the realism floor (kills concrete-but-unreachable scenarios); also dedups. Classifications: CONFIRMED / STALE / UNREALISTIC / DUPLICATE; uncertain → CONFIRM (fail toward fixing). Convergence/plateau checks now run on the confirmed count; triage-agent death fails open (fix everything). Rejected findings carry to r≥2 as non-re-reportable (refute-the-rationale-or-drop) and surface in the result as `triageRejected`. Rationale vs fixer-dispute: the fixer judging severity is a conflict of interest (disputing = less work); vs orchestrator power: the last three episodes all leaked at the orchestrator layer, and run-flow.md keeps the orchestrator away from diffs by design.
3. **Fixer verification contract rewritten** (fixerPrompt + review-loop.md Step 2): verify the finding's FAILURE SCENARIO, not the edit. Wiring/rendering/reachability findings: compile is explicitly insufficient — trace route config → the component the route REALLY renders → template/inheritance chain, cite file:line per hop, confirm the fix lies ON that chain; if the finding names a component, verify it's the routed one BEFORE fixing (this exact check catches the wrong-component fix). Unverifiable-without-runtime → say so in issues, never claim fixed on a compile. In the workflow, triage-confirmed findings are non-disputable by the fixer; standalone review-loop.md (no triage seat) keeps a fix-or-dispute option as its realism valve.
4. **Code r≥2 re-reviewer gets context it never had**: `appliedFixes` (per-round findings + fixer's account — verify each fix lies on the finding's scenario path, re-report as `UNFIXED:` otherwise; don't re-litigate for rigor) and `triageRejected` blocks. Mirrors plan review's applied[] machinery; this is the gap that lost the Edit button after detection succeeded.
5. **Angular DI-inheritance + route-trace check in the `correctness` lens** (review-panel.md): constructor DI decorators are not inherited — subclass dropping a base's injected param compiles and injects null; never trust a component's name for what a route renders. The root defect, fully text-visible; no reviewer had been told to look.
6. **Validation gates** (validationPrompt, both workflows): skipped/not-run acceptance test = FAILURE of that criterion (kills green-by-skip / T10-certifying-skips); plan's `Runtime Verification` section executed LIVE via the playwright-cli skill (route → assert render → act → observe), each step reported, unexecutable step = FAILURE, static checks never substitute.
7. **Plan templates** (feature/bug/chore.md): Validation Commands = executable commands ONLY (the buried-comment gate); new `## Runtime Verification` section (required when user-visible) with playwright-cli steps equal in force to Validation Commands; do NOT author Playwright `.spec.ts` files unless CI actually runs them — an authored-but-never-run spec is a fake gate (T-16/T-17 cost two tasks + review rounds and never executed once).
8. **run-flow.md**: post-manual-fix sanctioned paths = resume byte-identical OR `workflows/review-flow-only.js` — never `exec:review-loop`/`review-panel`; Step 4 report gains the triage-rejected line.
9. **`discoveries` sorted** in discoveryNote (sorted copy) — completion order was unreproducible on replay and cache-busted wave 2+ on every resume.

Both scripts syntax-checked (async-wrapped `node --check`). Zero runs behind all of it. Cache note: every plan- and code-review prompt changed → resuming any pre-edit run busts those phases (Execute-phase task prompts unchanged except the discovery sort, which busts wave-2+ only where discoveries were non-empty and unsorted).

Watch on the next runs: (a) triage over-rejection — does a real finding ever get killed as UNREALISTIC (the confirm-when-uncertain guard is prompt-level only); (b) does the validation agent actually drive playwright-cli, and does the next planner output include a Runtime Verification section; (c) does the r≥2 `UNFIXED:` path fire on a wrong-path fix; (d) triage cost — one sonnet read-only agent per review round.

### Proposals — status after the above

1. **Capture `E2E_ADMIN_STORAGE_STATE` once (TPV2-side)** — open, **deferred by user 2026-07-25** ("we'll pick up later"); the only remaining piece. Agreed procedure for the next TPV2 session: start the app → log in once via playwright-cli as an admin with MODIFY (user supplies credentials, or completes SSO/2FA in the opened browser) → save storage state to a gitignored path (e.g. `frontend/e2e/.auth/admin-state.json`) → set `E2E_ADMIN_STORAGE_STATE` to it. First capture: decode the token/cookie expiry from the JSON to learn the real recapture cadence (unknown until inspected — it's the app's session lifetime, hours vs weeks); if short and login is plain user/pass, add a tiny auto-recapture script triggered on auth failure. Same session: re-verify the orchestrator's manual Edit-button wiring fix at runtime (still unverified). Security: the file is a live admin session credential — never commit it.
2–6. Applied above (2→#6, 3→#3, 4→#9, 5→#7, 6→#8).
7. Resolved differently per the autonomy principle: no user-decision flagging — the realism floor + triage gate drop unrequested rigor autonomously, grounded in the spec.

## 2026-07-25 — The meta-loop fired again despite the ban: `wf_bf177017` → `wf_2bd2110a`, 8 review rounds, zero code (admin-financial-override, session `e80fc442`)

Second occurrence of the never-ending-plan-review pattern, **after** the 2026-07-24 fixes. Both in-run safeguards worked (4-round backstop fired cleanly both times); the failure was again at the orchestrator layer — the forbidden relaunch-into-full-plan-review happened anyway, through a loophole in how run-flow.md's UNRESOLVED_PLAN options are worded.

### Timeline

1. `wf_bf177017` (10:45–11:42): spec input → NEEDS_DECISION (6 conflicts) → orchestrator auto-resolved (4 unique, correctly grounded in spec's own line 409 / line 216) → resumed reviser-first with 23 carried findings → r2, r3, r4 each surfaced NEW determined findings → **4-round backstop → UNRESOLVED_PLAN** with 2 findings (T10 E2E-cleanup coverage; T3/T5 zero-row-UPDATE unforceable without an `updateBase` seam).
2. Orchestrator correctly diagnosed the known pattern ("task bundles behavior change with its own test-injection design") and asked the user. **But its AskUserQuestion mislabeled the options**: recommended option (a) was phrased "split... then re-run full plan review from scratch."
3. User picked (a). Orchestrator then did NOT re-plan — it made 7 hand-edits to the same plan (added the `updateBase` seam, enumerated T-16/T-16b/T-17b cleanup; **no actual task split**) and launched `wf_2bd2110a` (15:52–16:29) with `inputType: "plan"`, no `skipPlanReview` — exactly the combination run-flow.md forbids (manual apply → fresh full review, clean-slate ratchet).
4. Run 2: r1 panel found **13 new determined findings** on the already-4-rounds-reviewed plan → r2 found a new gap (moduleRef leak when `createNgModule`/`MatDialog.open` throws pre-`afterClosed`) → fix added a destroy-counter contract → **r3's finding was about that counter** (cumulative count omits T-16b/T-17b opens) → fix → r4 found a genuinely real pre-existing bug (T7 conditionally appends `edit` to `columnNames` but only `tp-table.component.html` gets the `matColumnDef`; `TableViewAdminComponent` has its own template → missing-column runtime failure) → **backstop → UNRESOLVED_PLAN #2**, 1 finding unapplied.

Net: 8 plan-review rounds, ~27 workflow agents, zero implementation. `skipPlanReview` STILL unexercised — two UNRESOLVED stops in a row and the escape hatch built for exactly this was never taken.

### Root causes (this episode's new evidence)

1. **run-flow.md option (a) is a loophole.** "Re-plan/split the flagged task" doesn't say *who* re-plans. The orchestrator satisfied it with hand-edits + full re-review — option (b)'s mechanics with option (a)'s re-review, the exact banned combination. The 07-24-night success case was a *planner-authored* fresh plan; that distinction never made it into the wording.
2. **The severity floor can't stop this ratchet — the findings legitimately clear it.** r2/r3/r4 findings all carry concrete implementer-produces-broken-work scenarios. The problem is upstream: every fix ADDS verification machinery (seams, counters, cleanup contracts), and new machinery is new surface for coherence defects. r3-finding-about-r2's-fix is the plan-review analogue of the code-review fix→new-bug ping-pong — but the plan loop has no plateau/regression signal, only the dumb backstop.
3. **Review rounds sample, they don't exhaust.** The real T7 admin-template bug surfaced only at overall round 8, after 3-seat panels and 3 single re-reviews had all missed it. "0 new findings" was never going to arrive; there is no fixed point to converge to on a plan this dense with contracts.
4. **Second data point for the bundling rule**: T3/T5 (write op + fault-injection design) and T10 (E2E flow + cleanup contract) are exactly the "task bundles behavior + its own test-verification design" shape that T7-audit-bait was the first data point for.

### Changes applied (2026-07-25, user-approved, uncommitted)

`commands/exec/run-flow.md`, UNRESOLVED_PLAN branch: options (a)/(b) rewritten as unmixable. (a) Re-plan = the **planner** authors a new plan from the spec — hand-editing the existing plan explicitly does NOT count, no matter how large; only a planner-authored plan may re-enter full plan review. (b) Apply + skip = manual fixes → `skipPlanReview: true` → Execute. New stated invariant: a hand-edited plan must never re-enter plan review. AskUserQuestion option descriptions must carry these definitions — "apply fixes then re-run plan review" may never be offered (that mislabeling is what let this episode through). Zero runs behind the new wording.

### Mid-run addendum (2026-07-25 ~17:40) — `wf_f72ce22c`, the protocol-compliant retake, evaluated live at plan-review r3-applied

User killed the leftover attempts (session `7d71e164`, both runs dead with no result), then in a fresh session (`853c282a`, explicitly `/model sonnet` — the Sonnet-watch test) re-ran `/exec:run-flow` with the SPEC — a genuine option (a): the Opus planner authored a NEW plan (`admin-financial-override-plan-2026-07-25.md`, 9 tasks).

- **Codex UNAVAILABLE path FIRED FOR THE FIRST TIME EVER** (previously "the single biggest untested risk", 0 fires across 15+ invocations). All 3 r1 seats died with `SSL certificate verification failed` (likely fallout from the same-day firewall/allow-list work). The workflow behaved exactly per design: hard `FAILED` at plan-review with the explicit codex reason — no silent pass. Orchestrator diagnosed it correctly as infra-not-plan and reported honestly.
- **Sonnet orchestrator: protocol-clean so far.** Resume after the SSL fix used byte-identical args (planner + parse replayed from cache ✓). NEEDS_DECISION (4 conflicts) self-resolved per protocol, carriedFindings (23) passed back verbatim ✓. One decision to re-verify later: numeric parsing chosen as "strict finite JS-number semantics" where the previous plan's run had concluded the form sends *strings* — coherent only if the new plan makes the frontend parse before POSTing.
- **Reviser quality up**: both revise agents verified claims against live code before editing (confirmed `TpTableBaseComponent.reload()` exists; confirmed neither table-constants file has an ACTION column).
- **Finding trajectory: 27 applied (r1+carried) → 3 (r2) → 2 (r3) → r4: flat PASS, 0 determined, 4 nits.** Converged with zero rounds to spare; Execute began ~17:45 (T1 SUCCESS immediately). The severity floor visibly held at r4 — all 4 nits are precision/rigor upgrades (~2KB→2048 bytes, baseline-selection rule, second-view qualifier) that yesterday's rounds would have escalated.
- **r2/r3 finding quality (full-text review): 3 of 5 real and code-grounded** (T6 no-ACTION-column — Edit control would never render, verified live; C9 old_value=new_value audit corruption; T6 mat-table columnNames/colspan rendering contract — 3rd appearance of this exact trap across two plans → planner blind spot, planning-side note warranted). The other 2 rounds-costs were structural: r3-D1 was r2's OWN nit re-found and escalated (nit-drop policy converted a one-line fix into a full gated round — the wf_475989c4 nit-leak now has demonstrated round-cost); r3-D2, while real, corrected r2-D1's own wrong resolution (fix→new-finding signature, but the correction was code-true).
- **Net read on the restructure proposal**: this run is a partial counterexample — the legitimate path converged and r≥2 rounds carried real value; but every keeper would also have been captured by a single non-gating apply pass, except r3-D2, which is the concrete case for keeping one gated verify round: without it, r2's wrong resolution reaches Execute and costs an implementation round-trip instead of a review round. Cheapest confirmed wins regardless: (a) r≥2 reviser should also receive nits (or next round's prompt lists prior nits as known), (b) planning-side note for the mat-table column-rendering trap.

### Changes applied (2026-07-25 evening, user-approved, uncommitted) — nit-leak fix + planner bundling rule

`workflows/run-review-flow.js`, plan-review loop (syntax-checked, async-wrapped `node --check`):
- **Nit-leak closed, both ends.** (a) The reviser now receives the round's nits alongside determined findings, gated best-effort: apply only trivial local edits (wording, exact thresholds, stale phrases), skip and report anything scope-expanding — nits never justify restructuring. (b) r≥2 re-reviewer prompts get a `knownNits` block (all nits seen so far): do not re-report, do not escalate to blocking without a concrete failure scenario the earlier round lacked. Evidence: r3-D1 on `wf_f72ce22c` was r2's own nit re-found and escalated — a full gated round for a one-line fix; same leak burned 4× duplicate reports on `wf_475989c4`.
- **Planner prompt gains the bundling rule** (2 data points: T3/T5 seams, T10 cleanup contract): a task must not bundle a behavior change with the design of its own test-verification machinery — it goes in Shared Contracts or a dedicated prerequisite task.
- Cache note: r1 panel prompts render byte-identical (the new blocks are empty strings at r1), so resumes still replay planner/parse/r1 from cache; r≥2 reviewer/reviser entries bust when nits are present. `wf_f72ce22c` is mid-Execute on its in-memory pre-edit copy — unaffected unless resumed.
- Zero runs behind both edits. Watch: (a) does the trivial-only gate hold or does the reviser scope-creep on nits; (b) any known-nit escalation despite the block; (c) does the next planner output actually separate machinery from behavior tasks.

### Proposals (pending user decision)

- ~~TPV2-local planning note for the mat-table column-rendering trap~~ — **retracted 2026-07-25** (user pushback, correct): the "3 data points" were one trap on one feature within 24h, and CLAUDE.md would tax every TPV2 turn to guard a rare planning slip the review panel caught all three times. If it recurs on an unrelated feature, the fix is a comment at `TpTableBaseComponent`'s `columnNames` derivation, not harness context.
- **Plan-review loop restructure (discussed 2026-07-25, not yet approved)**: r1 panel stays fully gating; r2 single re-review gates ONLY on repeats (resolutions demonstrably not applied); new r2 findings get one final reviser pass (or carry as advisory into implementer prompts/code review) without triggering r3+; r3/r4 removed. Rationale: plan re-review value decays because the reviewed text barely changes — unlike code re-reviews, which see genuinely new code each fix round and have caught real fix-introduced bugs (keep that loop as-is).
- **Orchestrator model upgrade — deferred by user 2026-07-25.** Yesterday's loophole session ran Sonnet 5; orchestrator duties have outgrown "bookkeeper" (NEEDS_DECISION auto-resolve, re-plan/skip calls, hand-applying findings), and every orchestrator-layer miss cost 10–20 agents. Proposed default: Opus 4.8 for run-flow orchestrating sessions + an advisory line in run-flow.md. Decision: watch the upcoming admin-financial-override relaunch on the SAME Sonnet 5 session first — judge its protocol adherence under the tightened UNRESOLVED_PLAN wording (does it hand-apply the T7 finding and relaunch with `skipPlanReview: true`, args clean, no re-review?) before deciding.
- **Plan-reviser guardrail (run-review-flow.js)**: revisions should prefer simplifying/removing verification machinery over adding contracts/counters; a fix that adds a new observable contract is a smell worth flagging rather than silently expanding.
- ~~Immediate unblock for this run~~ — obsolete: user chose a full re-plan instead (`wf_f72ce22c`, see addendum), which converged at r4 and reached Execute. `skipPlanReview` remains unexercised.

---

## 2026-07-24 (night) — `wf_11c56662` full-pipeline run: convergence fixes' first outing, spec → reviewed code in ~63 min

The relaunch after the non-convergence episode (entry below). User re-planned from the tech spec in a fresh session (`fe732000`) rather than using `skipPlanReview` — so the escape hatch is still unexercised, but the re-plan itself validated option (a): the Opus planner produced a leaner 4-task plan and the T7 audit-everything reviewer-bait task disappeared. Terminal state: 4/4 tasks COMPLETED, validation PASS, code review UNRESOLVED with exactly 1 real finding left.

### Timeline

Planner 19:32–35 (Opus, 4 tasks) → parse → plan-review r1 panel 19:36–40 (3/3 codex up: 16 determined + 1 NEEDS_DECISION + 2 nits) → orchestrator auto-resolved + resumed 19:41 (reviser-first) → r2 single codex re-reviewer 19:45–47: **flat PASS, zero findings of any kind** → Execute: T1 19:47–50, T2∥T4 19:50–52 (disjoint-files parallelism worked), T3 19:52–20:12 → validation PASS → code review r1 panel (9 blocking) → fix 1 → r2 (3 blocking) → fix 2 → r3 (1 blocking) → 2-fix cap → UNRESOLVED, terminated ~20:35.

### What the run validated

- **Plan review converged in 1 revise round** — first r2 exercise under the new severity floor. Confounded: the plan was also brand-new and leaner, so floor vs better-plan can't be separated. No REPEATs fired, so the reclassification shim is also still unexercised.
- **NEEDS_DECISION auto-resolve, 2nd validated exercise.** The conflict was sharp (pagination: a real filter can leave rendered `tr[mat-row]` count at page size, making row-count gates unreachable); orchestrator's resolution held through implementation.
- **`discoveries` carry-forward populated for real: 22 facts** (T1: 6, T4: 2, T2: 5, T3: 9), high quality — `--legacy-peer-deps` requirement, MDC paginator class rename (`mat-mdc-paginator-range-label`), Material panel content absent until expanded, en-dash range-label parse regex. T3 inherited 13 facts before writing its first test. Consumption not directly measured; T3 still the heaviest agent (762KB transcript, ~20 min).
- **Code review panel earned its seats — no ratchet.** r1's headline was decision-grade: the implementer had discovered the anchor table (`pa-obligated`) has NO currency widget and silently switched T-04/T-07 to an excluded sibling table; all 3 seats caught the unauthorized scope deviation and framed it as a plan contradiction to resolve, not paper over. r2 found a genuinely new race (switchTable trusted URL change; Angular reuses the routed component, so a baseline can be captured from the stale table → concrete false-pass scenario). r3 found a genuinely new bug **introduced by fix 2** (readiness = "paginator total differs from pre-switch" — but two tables can legitimately share a total → timeout on healthy data). Every round: real, novel, concrete-scenario findings.
- **The 2-fix cap worked as designed**: stopped a fix→new-bug ping-pong on the same helper at round 3 and surfaced the remainder honestly instead of looping.

### Open questions / observations (not fixed — 1 data point each)

- **Fixer amended the plan autonomously** to authorize the sibling-table scope exception. Right call here and visible in the summary, but it's a scope decision taken without the human; if this recurs on something riskier, consider routing plan-amending fixes through the NEEDS_DECISION path.
- **Task-size imbalance:** T1/T2/T4 held ~15% of the work; T3 (one spec file, 7 live-browser tests) serialized everything else — wall-clock ≈ T3. File-based parallelism can't split a single spec file. Candidate planning-side rule: split independent test groups into disjoint spec files. Same discipline as the audit-bait rule: wait for a second data point.
- ~~**Code review r≥2 has NO severity floor**~~ — closed same night, see Changes applied below.

### Changes applied (2026-07-24 night, after the run, uncommitted)

`workflows/run-review-flow.js`, code-review loop:
- **Convergence-aware stop replaces the hard 2-fix cap.** Keep fixing while the blocking count strictly shrinks; a plateau/rise after 2 fixes (the fix-introduces-new-bug ping-pong signature — exactly fix2→r3 this run) or 4 fix rounds total stops UNRESOLVED. On this run's trajectory (9 → 3 → 1) it would have run fix 3 + r4 and almost certainly PASSed instead of bailing with 1 small finding left.
- **Code-review r≥2 severity floor** (mirrors plan review's): blocking requires a concrete failure scenario (input/state → wrong result, crash, or false test pass/fail); rigor/exhaustiveness upgrades are nits. Matters more now that the loop can run more late rounds — keeps the count signal the plateau check reads trustworthy.

Rejected: unconditional cap raise (spends the same rounds on genuine ping-pong); regression-tagging findings as introduced-by-last-fix (real machinery for what the plateau check catches one round later — revisit if plateau detection misfires).

### Open items / cautions (refreshed)

- `skipPlanReview` — still zero runs (user chose re-plan instead; that path validated).
- REPEAT reclassification + strict REPEAT definition — still unexercised (no repeats fired this run).
- Plan-review severity floor — 1 clean run, confounded with the leaner re-plan.
- Codex UNAVAILABLE/quorum-drop — still never fired (7 more codex invocations this run, 3/3 and 1/1 seats up every round).
- Convergence-aware code-review stop + code-review severity floor — zero runs behind both; watch the next code review for (a) whether a shrinking-count run now closes instead of bailing, (b) whether the 4-round backstop or plateau check ever fires, (c) late-round finding quality under the floor.
- Leftover from this run: 1 real unresolved finding — `switchTable()` readiness signal in `frontend/e2e/support/table-view.locators.ts` uses business-data inequality; needs a destination-specific signal. Being fixed manually in the TPV2 session.

---

## 2026-07-24 (evening) — Never-ending plan revisions: 3 full review cycles, zero code (`wf_744f8f49` → `wf_d2b40886` → `wf_a67e85b3`, playwright-e2e plan)

The all-codex panel's real failure mode finally showed itself — not UNAVAILABLE (still 0 fires ever), but **perfectionist non-convergence**. 50 min, 1 Opus planner, 9+ codex reviewer seats, 2 large Sonnet revise passes, 2 orchestrator hand-edits of the plan, zero implementation. User killed run 3 mid-parse.

### The loop (session `ea52ff32`, TPV2)

1. 18:32 `wf_744f8f49` (spec): plan → r1 panel 3× NEEDS_WORK (config discovery) → revise → resume w/ decisions → r2 flagged `REPEAT: show-report --config` → stop.
2. 18:56 `wf_d2b40886` (fresh, plan input): full panel again → ~20 findings + NEEDS_DECISION → auto-resolve + resume → reviser applied all 20 → r2: 1 new determined + 2 REPEATs → UNRESOLVED_PLAN.
3. 19:22 orchestrator hand-applied the final findings and launched `wf_a67e85b3` **fresh** — round counter and `applied[]` reset — full panel starting over. Killed by user.

### Root causes (evidence-verified)

1. **REPEAT ratchet.** Both run-2 REPEATs targeted T7 (terminal audit-everything task) and demanded *more rigor on fixes the reviser demonstrably applied* (explicit cwd, exactly-4-deletions enumeration, exhaustive selector grep). The seam wasn't still broken; the standard moved. Codex reads "did NOT actually resolve" as "resolved less thoroughly than I'd like."
2. **Run-1's REPEAT was self-inflicted**: `show-report --config` was *introduced by* r1's own resolution ("every direct invocation passes --config"), applied over-broadly by the reviser. Not an unapplied fix. Also misfiled: the wrapper put the `REPEAT:` string in `determined`, not `repeats`, so it triggered another revise instead of the stop.
3. **Relaunch resets convergence state.** Loop-until-dry + 4-round backstop are per-run; run-flow.md's UNRESOLVED option (b) "apply and re-run" re-entered the full panel with a clean slate each time — an infinite meta-loop the in-script safeguards can't see.
4. **No severity floor + codex always finds something.** PASS needs 0 determined across all seats; finding quality decayed to marginal (run-2 r2's only new finding: sort-witness row-text uniqueness — real, but a robustness nit escalated to blocking).
5. **T7 audit-task bait.** An audit task invites unbounded "your audit is incomplete" findings. The script's own UNRESOLVED message diagnosed it ("usually one overloaded task — re-plan or split"); the orchestrator picked re-run instead.

### Changes applied (2026-07-24, uncommitted)

`workflows/run-review-flow.js`:
- New `skipPlanReview: true` arg — skips the plan-review phase entirely; for relaunch-after-manual-apply of UNRESOLVED findings.
- `REPEAT:`-prefixed strings in `determined` are reclassified into `repeats` before gating (fixes the run-1 misfile).
- `appliedNote` redefines REPEAT: only when the required edit is *demonstrably absent* — "applied but could be more rigorous" is explicitly a nit.
- Round-≥2 re-reviewer prompt gains a severity floor: blocking = an implementer following the plan produces broken/contradictory work; rigor/exhaustiveness upgrades to tests/gates/audits = nits.

`commands/exec/run-flow.md`:
- UNRESOLVED_PLAN option (b) is now: apply fixes yourself → relaunch fresh with `skipPlanReview: true` → straight to Execute. Explicitly forbids relaunching back into plan review after manual apply. Option (a) re-plan/split annotated as the right call when repeats cluster on one overloaded task.

### Open items / cautions (refreshed)

- `skipPlanReview` + severity floor + REPEAT redefinition — zero runs behind all three; watch the next UNRESOLVED cycle for (a) whether the floor stops the marginal-finding ratchet at r2, (b) whether skipPlanReview relaunch lands in Execute cleanly.
- Severity floor is r≥2 only by design — r1 panel keeps full sensitivity; revisit if r1 starts blocking on nits too.
- Audit-style terminal tasks (T7 pattern) are reviewer bait — consider a planning-side rule (plan/*.md) against "audit everything" terminal tasks; NOT applied (needs more than one data point).
- Codex UNAVAILABLE/quorum-drop — still never fired. The convergence failure above is now the demonstrated codex-panel risk, not availability.

---

## 2026-07-24 (later still) — Token-burn investigation (TPV2)

User observed TPV2 burns tokens faster per prompt than other repos. Transcript analysis (14d, deduped by message id):
- Per-prompt cost in main sessions ≈ CZUB (0.79 vs 0.78 est units/turn); repo config/baseline context not the cause.
- Real differentiators: p90 context/call 204k vs 127k (fat tail of near-ceiling sessions); 71% of Reads full-file (497/699); screenshots 31 vs 4 (6MB); deleted `catalog.js` had been full-read 16/20 times; workflow agents 14M fresh/wk (median 55k/agent), plans 20–47KB read in full by every agent.

### Changes applied (2026-07-24, TPV2 harness only, uncommitted)

- TPV2 harness `CLAUDE.md`: new "Context discipline" section (ranged reads for 30–58KB controllers, jq/head for dumps, Explore delegation, element screenshots).
- TPV2 `tp-frontend-verify/SKILL.md`: screenshot cost rule — element-level (`playwright-cli screenshot <ref>`), one per verified state, prefer state introspection/`requests` over pixels.

**NOT applied (proposed, user rejected):** ranged plan reads in `run-review-flow.js` implementer/diagnostic prompts (was applied briefly, then reverted same day at user's direction — implementers still read the full plan by design). If plan-read cost comes up again, that's the known lever; baseline to beat: 55k median / 169k p90 fresh per workflow agent.

## 2026-07-24 (later) — `wf_475989c4` codex plan-review eval: real finding, but the lens panel is racing on shared temp files

Evaluated mid-run (through plan review r1+r2, T1 execute, validate; code review r1 in flight). First run of the all-codex panel AND first exercise of the round-2 codex re-reviewer. Plan was Sonnet-authored (broken `opus` alias, entry above).

### The good

- **The one blocking finding was real and load-bearing.** All 3 r1 seats reported the same T1 gate contradiction: lines 113–117 required the combined semantics/shared/envelope suite "still green" while lines 129–132 + spec documented the pre-existing `envelope.test.js:41` /meta failure. Reviser (`ab47d1ae`) applied a targeted `--grep` gate and **empirically verified it** (ran the new command: 5 passing, 0 failing). Fifth straight run where codex sourced the run's decision-grade finding — this time against a Sonnet-authored plan.
- **Round-2 codex re-reviewer (first exercise): clean per contract.** Got the applied-resolutions block, no false REPEATs, didn't re-report applied work, PASS with 0 determined; loop converged in 1 revise round. Weak stress test though — 1-task plan, 1 applied resolution.
- Wrapper fidelity clean (one `codex exec` each, verbatim transcription, 27–45K peak ctx, ~90 s wall each). UNAVAILABLE still never fired (now 0/7+ invocations this run alone).

### The bad — proven race on shared scratchpad paths (NEW, highest priority)

All wrappers write the SAME files: `<scratchpad>/codex-prompt.md` and `-o <scratchpad>/codex-review.md`. Tool-result timestamps prove the r1 panel raced:

- cross-task wrote 22:44:23.8, exec'd 22:44:27+ — got its own prompt (probably).
- gates wrote 22:44:42.7; **contracts overwrote 22:44:44.9; gates' codex launched ≥22:44:46.7 → gates' codex ran the CONTRACTS prompt.** The gates lens never executed; contracts ran twice.
- Output file equally shared: gates' exec finished 22:45:25, contracts overwrote `codex-review.md` 22:45:29.7, gates' turn ended 22:45:36 — its transcription may be contracts' output.
- The 3× verbatim-identical finding+nit is thus partly race artifact (two seats ran one prompt), partly legit convergence (1-task plan; every seat runs all checks).
- **Code review r1 (in flight at eval time) re-fired the race**: second wrapper overwrote the prompt at 22:53:12–23, inside the first wrapper's codex launch window.

**Fix:** unique temp filenames per seat and round — applied after the run terminated; see the "Change applied" section below.

### Nit leak, now cross-round noise

The malformed "`spec.ops`-and-`ops` undefined" phrase (plan line 87) was reported 4× (all 3 r1 seats + r2) and still sits in the plan — nits never reach the reviser by design, so every round re-pays the tokens to rediscover them. Consider: reviser also gets nits, or r2 prompt lists prior nits as known/ignorable.

### Code review r1 eval (run terminated 22:53:56Z — all 3 seats PASS, 0 blocking, 0 nits; validate SUCCESS, 435 passing / 1 pre-existing known failure)

**The race fired here too, proven the same way (tool-result timestamps):**

- Prompt-file overwrite sequence: `aa700f78` wrote 53:01/53:04, `a466ecb9` wrote 53:03.9 (clobbered by aa700f78's 53:04.4 rewrite), `a2e923b8` wrote 53:12/53:23.
- Codex launches: aa700f78 53:07.5 → got its own prompt back **only because its own rewrite had clobbered a466ecb9's**; **a466ecb9 53:08.1 → ran aa700f78's `resilience` prompt — its own lens NEVER executed**; a2e923b8 53:26.9 → own ✓.
- Outputs did NOT cross this round — each wrapper read `codex-review.md` within ~2 s of its own exec finishing, before the next overwrote it. Pure luck of spacing.
- Net: `resilience` ran twice, a2e923b8's seat once, one seat's lens dropped. The two same-prompt codex runs produced near-identical 7-angle PASS reports — corroborates the identical-findings-are-race-artifact read from plan review.

**NEW defect — wrapper prompt-composition infidelity (code wrappers only):** 2 of 3 wrappers composed thin prompts (961 B / 1968 B) telling codex to "Read ~/.claude/commands/exec/review-loop.md in full" instead of inlining the Step 1 reviewer prompt — despite the template's own "(codex cannot read ~/.claude)" note. It happened to work (read-only sandbox allows reads, and both outputs cover all 7 review-loop angles), but composition was delegated to codex and lens scoping shrank to one line. Only a2e923b8 built the intended self-contained prompt (4.9 KB). Plan wrappers all inlined correctly (~4.3 KB) — the plan template's step 2 wording is more explicit.

**Impact this run: low** (empty PASS merges regardless), but the "panel PASS is evidence" premise was hollow — effectively 2 distinct prompts ran, not 3 lenses. Also cosmetic: code wrappers said "one of 4 parallel reviewers" (stale review-panel.md phrasing; the workflow panel is 3).

### Change applied (`workflows/run-review-flow.js`, uncommitted, post-termination — no live run affected)

1. `CODEX_WRAPPER_RULES` → `codexWrapperRules(slug)`: temp filenames are now `codex-prompt-{slug}.md` / `codex-review-{slug}.md` with slug = `plan-r{round}-{lens}` / `plan-r{round}` / `code-r{round}-{lens}` / `code-r{round}`, with an explicit "suffix is MANDATORY — parallel panelists share the temp dir" line.
2. Both wrapper templates' step 2 now demand a fully self-contained composed prompt — never instruct codex to read files under ~/.claude.

Syntax-checked (async-wrapped `node --check`). Zero runs behind these edits. Cache note: rewritten wrapper prompts bust plan/code-review cache entries on any resume of pre-edit runs (wf_475989c4 is terminal-complete, so only relevant if it gets resumed for a re-review).

### Open items delta

- ~~Codex shared-temp-file race~~ — fixed above; verify on the next run that each wrapper actually uses its suffix (the instruction is prompt-level, not enforced).
- Wrapper self-containment fix — zero runs; check next code review r1 that all 3 composed prompts are ~4-5 KB and inline the lens definitions.
- Round-2 codex re-reviewer — 1 clean run, but on a trivial convergence case; still watch a multi-round plan.
- Fixer false-positive handling (from `wf_760d1b0d`) — this run had no fixer round (clean PASS), still unobserved.

---

## 2026-07-24 — CLI 2.1.219 broke the `opus` model alias; planner silently ran on Sonnet 5

User noticed `wf_475989c4` (mcp-through-quarter bug) planned on Sonnet. Verified from agent transcripts: every `model: 'opus'` workflow agent on CLI 2.1.215–2.1.218 (Jul 20–24) ran on `claude-opus-4-8`; the first run on **2.1.219** requested opus (meta.json confirms) but all 35 assistant turns ran on `claude-sonnet-5` — no fallback/overload event, the alias just resolved to the session's main-loop model. Live probe (`wf_94bf88bf`) confirmed: `opus` → session model (fable-5 in that session), `sonnet` → sonnet-5 ✓, `haiku` → haiku-4-5 ✓, explicit ID `claude-opus-4-8` → opus-4-8 ✓. Only the `opus` alias is broken — likely repointed to Opus 5 (Claude 5 rollout) which this account can't reach, with a silent inherit-fallback.

### Change applied (`workflows/run-review-flow.js`, uncommitted)

Planner seat pinned to the explicit ID: `model: 'claude-opus-4-8'` (line ~370). Workflow `agent()` accepts full model IDs; verified live.

### Known residual — Agent-tool commands can't be pinned

The Agent tool validates `model` against the alias enum (`sonnet|opus|haiku|fable`) and rejects explicit IDs (probed, InputValidationError). So the 9 `model: "opus"` spawn instructions in `commands/exec/*.md` (run, run-review, run-loop, review-loop, review-loop-mult, review-panel, plan-review) silently run on the session model until Anthropic fixes the alias or grants Opus 5 access. Re-probe after the next CLI update; consider `fable` for those seats if the alias stays broken (more capable than Opus, but draws usage credits).

### Eval note

`wf_475989c4`'s plan was authored by Sonnet 5, not Opus — treat any planner-quality judgments from that run accordingly.

---

## 2026-07-23 (night) — `wf_760d1b0d` mid-run round-1 data → all reviewer seats to codex; opus out of the workflow

Evaluated `wf_760d1b0d` (TPV2 session `920fb639`, PA query row-duplication bug plan) mid-run — the FIRST run of the codex-primary panel, caught right after round 1 + revise, with the round-2 opus reviewer live.

### Round-1 evidence (first exercise of the 3-codex-lens + opus-anchor shape)

- **Lens-scoped codex kept its decision-grade quality**: all 10 blocking DETERMINED findings came from the 3 codex lenses (37–58K peak ctx each), with healthy cross-lens overlap (description-contradiction 2×, `project_cost_usd`-impossible 3×). The lens-scoping-erases-codex's-edge worry did not materialize.
- **The unscoped opus anchor contributed zero blocking findings** — 2 verified nits only, at 117K peak ctx, the most expensive seat for the least yield. Inverts the old question ("does the opus anchor keep finding what the unscoped codex seat did"): on this run, no.
- Codex UNAVAILABLE: never fired, 4th straight run (now 0/6 wrapper invocations counting all seats).

### Change applied (`workflows/run-review-flow.js`, uncommitted): codex holds ALL reviewer seats; opus is planner-only

User decision (supersedes "Round-2+ single reviewers stay Opus" and the earlier "Rejected: opus for harness eval only"):

- Round-1 panels (plan + code): 3 codex lens wrappers only — opus anchor seat removed.
- Round-2+ single re-reviewers (plan + code): one unscoped codex wrapper (haiku), told it's the verify-round reviewer; plan re-reviewer gets the applied-resolutions block and maps codex "REPEAT:" findings into `repeats`.
- `planReviewerPrompt`/`codeReviewerPrompt` (Claude reviewer builders) deleted; opus remains only as planner.
- **Opus's reviewer role is now reserved for offline harness analysis/tuning** (/reflect + this log), never a workflow seat.
- **Outage semantics changed** (no opus fallback left): all-lens UNAVAILABLE at plan review round 1 or any round-2+ UNAVAILABLE → `FAILED` with an explicit "codex CLI unavailable" reason; at code review → `review: UNRESOLVED` with the same. The workflow stops honestly instead of silently passing unreviewed work. This path has still never fired — it is now the single biggest untested risk (100% of review coverage is one vendor's CLI).

Cautions: `wf_760d1b0d` was live (round-2 opus reviewer in flight) at edit time — it finishes on its in-memory OLD copy; any resume gets the new all-codex code, and the rewritten reviewer prompts bust plan-review cache entries on resume. Zero runs behind the round-2-codex seat; evaluate its verify-pass quality (does it catch reviser under-application?) on the next run.

### Rest-of-run eval (22:03, fixer just dispatched — plan review r2 → execute → validate → code review r1 complete)

**Plan review r2 (opus, PASS):** 0 determined, 2 nits — one genuinely useful (T4's pre-T2 mocha gate is *expected* mixed-pass, so the gate must be judged per-case, not by process exit code — exactly the kind of orchestrator-trap note worth having). Loop converged in 1 revise round; the opus verify pass found nothing the reviser missed.

**Execute (5/5 SUCCESS, one retry):** peaks T1 80K, T4 139K, T3 42K, T5 90K, T2 attempt-1 147K → **died on "API Error: Connection closed mid-response"** (infra kill, NOT the background-Bash/StructuredOutput trap from `wf_ea848751`), T2 retry 172K → SUCCESS, found the crashed attempt's controller work already in place and only authored the missing SQL-capture test — task-prompt idempotency validated again. `discoveries` carry-forward populated and injected into every later task prompt. Only one agent >160K (the retry, which inherited re-verification work).

**Validate:** SUCCESS, no genuine regressions.

**Code review r1 (old-script panel: 3 codex lenses + opus anchor — this run predates the all-codex edit). Precision collapsed on two codex seats; repo-verified finding-by-finding:**

- **codex:correctness (`ad8b8537`): 1 blocking, REAL and high-value.** `PA_SITE_COUNT_EXPR` (datasets.js:141) correlates on an **unqualified `PW_NUMBER`**, which binds to the inner `PR_PA_DAMAGE_POINT d` — a `d.pw_number = d.pw_number` tautology, so every row reports the global site count and the `sites` sort can't rank. Pre-existing in the untracked mcpV1 tree but load-bearing for this plan's `number_of_sites` MAX agg. Missed by the 17-test T4 suite, validation, AND the opus anchor. Fourth straight run where codex sourced the run's best finding.
- **codex:resilience (`a80f029`): 4 blocking, ALL FALSE/STALE** — recycled round-1 PLAN findings already applied: description at datasets.js:378 already says "one grouped row per PW_NUMBER"; pa-grouping.test.js:221–230 already splits `project_cost_usd` by dataset; semantics.test.js comment done; query-nongrouped-sql.test.js exists and does capture SQL byte-identity. "Expected fix" text is plan-revision language ("amend T1 to…"), not code fixes.
- **codex:tests (`ad77e203`): 4 blocking, same set, all false/stale.** Likely mechanism: both formed expectations from the plan's (revised) task instructions, then pattern-matched leftovers (the phrase "obligation increments (queryGroup)" survives at line 380 *inside the corrected sentence*) without reading the new prose.
- **opus anchor (`a0cff767`, 84K peak, 25 min wall = ~4 min work + one 21-min API stall between a tool result and the next assistant message — same signature as `wf_561ca1e8`'s opus stalls): PASS, 0 blocking, doc-prose nits.** Zero false positives — but missed the site-count bug. Codex wrappers in the same round: ~1 min each; the recurring opus-request stalls leave the workflow with the all-codex change.

Net: merged r1 verdict NEEDS_WORK with 9 blocking findings, 8 false. The sonnet fixer (dispatched 22:02) gets all 9 — expected outcome: 8 no-op verifications + 1 real fix, a wasted-effort pattern the interactive review-panel.md explicitly prevents via **orchestrator verification of findings before dispatching the fixer — a step the workflow port dropped** (merge flatMaps `blocking` straight into `fixerPrompt`). This matters MORE post-all-codex: the anchor's PASS no longer counterweights, and 2 of 3 lens seats were pure noise this round.

### Open items (carried + new)

- **NEW / highest priority: code-review false-positive control.** Options: (a) restore review-panel.md's verify-before-fix step as a cheap haiku "does this finding still hold against current code?" stage; (b) add to the codex code wrapper: "verify each finding against the CURRENT file content before reporting — plans may already be applied"; (c) both. Decide after seeing what the fixer does with the 8 no-ops.
- Round-2+ codex re-reviewer — zero runs; watch whether an unscoped codex verify pass catches non-converging revisions (`repeats`) as reliably as opus did. The false-positive pattern above raises the stakes.
- Codex CLI outage path — untested and now carries the whole review pipeline; first outage will hard-stop a run by design.
- ~~The two recommended edits from the `wf_ea848751` entry~~ — **applied 2026-07-24**: run-flow.md's PARTIAL branch now mandates byte-identical resume args; `run-review-flow.js` RESULT_NOTE + validation prompt now forbid `run_in_background` (foreground with explicit timeout). Zero runs behind both.
- `wf_ea848751` validate/code-review reviewer-by-reviewer eval — still pending.
- `wf_760d1b0d` finish: check the fixer's handling of the 8 false findings + the round-2 opus re-review (the last opus review in this workflow) before closing the run out.

---

## 2026-07-23 (later) — run `wf_ea848751` mid-run eval (session "mcp-fix", disbursements quarter-default bug)

Evaluated while the third invocation was still live (T5 retry in progress, validate/code-review not yet reached). Three invocations of the same runId: launch → NEEDS_DECISION at 22:42Z → resume with decisions → PARTIAL at 23:20Z (T5 agent died) → second resume at 23:21Z (current).

### Open items exercised — three fixes confirmed working

1. **NEEDS_DECISION auto-resolve: first real exercise, clean pass.** Two conflicts (T3 gate unverifiable — Opus `a5180610`; get_record contract contradiction — codex). The orchestrator read the bug-report spec, resolved both from its locked "Design Decision (agreed with reporter)" section with cited line numbers, and resumed in ~90 s with zero user interruptions. Both resolutions held: round-2 reviewer PASSed, implementers built them, and resolution 1 even folded in a reviewer *nit* (derive latest dynamically from /meta, not hardcoded 37). Quality: no complaints.
2. **Carried-findings fix: no finding loss this time.** All 10 `determined` findings (codex 3, opus lenses 0/2/5) were passed back verbatim on the first resume; reviser applied all 12 (10 + 2 decisions). Contrast `wf_561ca1e8`'s ~13 lost. Residual: the 10 round-1 *nits* still drop at the NEEDS_DECISION boundary — mostly re-derived later (refdataMap wiring resurfaced as round-2 planNits), so minor, but `determined`-only carry is a known small leak.
3. **Execute-phase `discoveries` carry-forward: populated and injected.** Every implementer returned 3–7 genuinely reusable facts (live-DB facts like "latest quarter = 37, top row PRASA $75,029,925", engine export names, DB-free test files); wave-2/3 prompts carried a "## Discoveries from earlier tasks" section. Context peaks: implementers 66–184K with ONE over 160K (T3, live-DB test authoring) vs four-of-eight over 160K (peak 267K) on `wf_ec4035a0-b63`. Different plan, so directional — but the T5 retry visibly reused T3's live-DB fixture facts.

### Reviewer performance (plan-review panel, round 1)

- **Codex (Haiku wrapper, `a356b3f2`): again best value per token.** 35K peak context, 19 turns → 3 determined + 1 of the 2 NEEDS_DECISION conflicts (the get_record spec-vs-plan contradiction, which no Claude lens raised). Unique findings: dashboard-parity assertion incompleteness, and the T5 eval-coverage gap ("largest disbursements" case unowned) — the latter drove real scope added to T5. Third straight run where codex produced decision-grade conflicts.
- **Opus lenses (72–106K peak):** `a452894b` most granular (5 determined — enumerated every breaking existing test with file:line), `a6f1cb55` found the unowned parity-test invariant, `a5180610` produced conflict 1 (T3 gate unverifiable — response has no per-row quarter signal) with the analysis that shaped the whole test strategy. Healthy overlap (parity break 2×, semantics breaks 3× at different granularity).
- Codex UNAVAILABLE/quorum-drop: **still never fired** (third straight success).

### Process defects found (evidence-verified)

1. **Resume-cache bust on the failure-retry resume — ~18 min + 8 live agents wasted.** Cache keys are content hashes of (prompt, opts). On the second resume (T5 retry), the orchestrator *rewrote* the carriedFindings — compressed applied ones to "RESOLUTION applied already in prior round" and extended codex's T5 finding with new oracle guidance (args 12,468 → 4,889 chars). Different reviser prompt → cache missed from the reviser onward → the whole plan-review loop (sonnet reviser, haiku re-parse, 8-min Opus re-review at 90K) and ALL FOUR completed tasks re-ran live (50–108K peak each), each concluding "already present", before the T5 retry finally launched 18 min in. With verbatim args, everything except T5 would have replayed from cache. Silver lining: task prompts proved idempotent — the no-op re-runs verified rather than broke.
2. **T5 agent death: background-Bash + StructuredOutput trap.** The first T5 agent launched the ~10-min eval via background Bash, then idled ("Waiting for the background eval run … to report back") — its turn ended without calling StructuredOutput, the nudge didn't recover it, and the wave failed → PARTIAL, validate/review skipped. The retry agent ran the same eval in *foreground* with `timeout 590` and progressed fine. Workflow subagents that background long commands and end their turn die.

### Change applied (2026-07-23 evening, `workflows/run-review-flow.js`, uncommitted): panel inverted to codex-primary

User decision after this evaluation (supersedes the previous entry's "Rejected: codex-primary"): both round-1 panels are now **3 codex lens agents + 1 unscoped Opus anchor** — codex wrappers (Haiku) take the `REVIEW_LENSES`/`CODE_LENSES` seats, the Opus anchor runs all checks unscoped and doubles as the CLI-outage fallback (all-codex-UNAVAILABLE degrades round 1 to the anchor alone instead of failing). Round-2+ single reviewers stay Opus. Dead lens branches removed from `planReviewerPrompt`/`codeReviewerPrompt`. Chosen over all-codex (single-vendor outage risk) and over running the queued comparison first — the first run on this shape IS the lens-matched experiment now: watch whether lens-scoped codex still produces decision-grade findings, and whether the unscoped Opus anchor keeps finding what the old unscoped codex seat did. Zero runs behind this. NOTE: `wf_ea848751` (live at edit time) runs its in-memory copy — its code-review phase, if reached in-process, uses the OLD panel; any post-edit resume gets the new one (and prompt changes will bust plan-review-round-1 cache entries, which is harmless since resumes skip round 1).

### Recommended changes (NOT applied — run still live; script edits mid-run risk the resume-cache footgun)

- `commands/exec/run-flow.md`: on a PARTIAL/failure-retry resume, pass the previous invocation's args **byte-identical** — enrichment belongs only in a resume that intends a re-revise. (Defect 1.)
- `workflows/run-review-flow.js` task-prompt template: "run long commands in the foreground with an explicit timeout; never `run_in_background` — ending your turn without StructuredOutput kills the task." (Defect 2.)

### Open items / cautions (refreshed)

- NEEDS_DECISION auto-resolve — ~~untested~~ **validated once**, both picks held through review + implementation.
- `discoveries` carry-forward — **working**; keep watching whether the 160K+ outlier count stays down on a bigger plan.
- Codex quorum-drop — still never fired (0/3), and it now matters 3× more: codex holds the lens seats.
- Codex-primary panel (change above) — zero runs; the first run doubles as the lens-matched codex-vs-Opus experiment, so evaluate it per-reviewer.
- Code-review-phase reviewer-by-reviewer eval — still pending; this run hadn't reached code review at eval time. Check `wf_ea848751`'s validate/code-review phases once it completes (T5 retry was mid-eval at 19:07 local).
- The two recommended edits above — apply after `wf_ea848751` terminates.

---

## 2026-07-23 — session wrap: decision auto-resolve, codex-panel questions parked, `wf_561ca1e8`/`wf_ec4035a0-b63` closed out

**Change applied** (`commands/exec/run-flow.md`): NEEDS_DECISION conflicts are now resolved by the orchestrating session itself by default (consistency with the spec's own Locked Decisions + existing code patterns + lowest-risk option), not thrown to the user via AskUserQuestion. Escalation is now reserved for genuine product/business tradeoffs with no technically-correct answer. Step 4 report gained a "Decisions made" section so self-resolved calls stay visible without blocking the run. Rationale: the user was getting NEEDS_DECISION pauses on internal contract/schema questions they had no context to judge and no time to learn. Zero runs behind this yet — next NEEDS_DECISION is the first real exercise.

**Decided, not yet run:** a lens-matched codex-vs-Opus comparison (3 ad hoc codex agents, each given one of `REVIEW_LENSES`' exact focus text, against the same plan file the real Opus panel reviewed) to test whether codex matches Opus lens-for-lens, or whether Opus's edge (it produced the run's highest-value finding) is lens-specific. Deliberately NOT wired into `run-review-flow.js` as a permanent mode (YAGNI — one-off diagnostic). Needs a completed plan-review run's plan file to point at.

**Rejected:** flipping the panel to codex-primary (3 fanned-out codex lens agents + 1 Opus doing only harness self-evaluation). Reasoning: (a) decides the question before running the comparison experiment above, (b) codex's demonstrated edge is specifically *not* sharing priors with the Opus lenses — forcing it into the same lens-scoped role risks erasing that edge rather than confirming it, (c) the codex UNAVAILABLE/quorum-drop path has never fired once; making codex 3-of-4 reviewers instead of 1-of-4 turns an untested single-vendor failure path into the majority of review coverage, (d) "Opus for harness eval only" duplicates what `/reflect` + this log already do for free, on-demand.

**Resolved from last entry:** `wf_561ca1e8`'s round-2 review never got directly observed — the resume-cache footgun (flagged below) fired for real: resuming it after the run-flow.md edits minted a new run, `wf_ec4035a0-b63`, which re-planned via the reviser-first path (3 carried decisions: financial_summary group_by shape, applicant-key fallback format, alias-manifest rollout) and ran to completion — Execute, Validate, and Code review all exercised. Code review is no longer untested: it surfaced a real bug (`applicant_type` filter returns numeric ids for `disbursements` but string names for `pa_projects`/`pa_vendors`, so no value works against both) plus a logging nit, and the user is now fixing it live in that session ("big-run"). Reviser-first resume path: confirmed working end-to-end.

### Open items / cautions (refreshed)

- NEEDS_DECISION auto-resolve default — untested, watch the first real conflict for whether the orchestrator's picks hold up.
- Lens-matched codex-vs-Opus comparison — queued, not started; needs a plan file from a finished plan-review run.
- Codex UNAVAILABLE/quorum-drop path — still never fired, still the biggest unknown blocking any future codex-weighting decision.
- Execute-phase `discoveries` carry-forward fix (below) — applied, zero runs behind it.
- Code-review-phase panel now has one real run of data (this entry) — worth a proper reviewer-by-reviewer eval (which panelist found the `applicant_type` bug?) next time, same rigor as the plan-review evaluations got.

---

## 2026-07-22 (later) — Execute-phase token blowup on `wf_ec4035a0-b63`

Measured real per-agent context sizes from the journal: plan-review opus lens reviewers peaked 45K-69K, but Execute-phase sonnet implementer agents hit 62K-267K, four of eight over 160K. Traced the worst one (267K context, 202 turns, 64 Bash calls): legitimate work, not bloat — grepping for field-naming conventions, live `dbq.sh` DB schema queries against tables the agent had never seen, `node -e` REPL probing of the new registry object, five-plus mocha reruns chasing green.

Root cause: every task starts a cold agent with zero memory of what an earlier task's agent already learned. This plan has multiple dataset-registry tasks needing the same underlying DB-schema/naming knowledge, so each independently re-pays the same discovery cost.

**Change applied** (`workflows/run-review-flow.js`, uncommitted): implementer/diagnostic-retry agents now return an optional `discoveries` list (reusable facts — table/column names, naming conventions, helpers — not task-specific narration). A `discoveries` array threads through the Execute-phase wave loop and gets appended to every subsequent task's prompt, so a fact one task pays to discover is a free `Read` for every later task instead of a re-derivation. Same-batch (parallel) tasks still can't see each other's mid-flight discoveries; only cross-wave sharing is covered.

Untested: this was applied after `wf_ec4035a0-b63` reached a terminal state (safe re: the resume-cache footgun), but the fix itself has zero runs behind it yet. Watch the next multi-task Execute phase for (a) whether `discoveries` actually gets populated and reused, and (b) whether it measurably lowers the 160K+ outlier count.

---

## 2026-07-22 — run `wf_561ca1e8` (plan review of MCP v2 generic-primitives spec)

Second evaluation of the codex-in-workflow integration (first: session `2c065807`, evaluated codex mid-run of `wf_7ed55d30` earlier the same day).

### Reviewer performance

- **Codex panelist (Haiku wrapper): best value per token, in both batches.** Batch 1: 3 min, 5.5k output tokens, produced BOTH NEEDS_DECISION conflicts (financial_summary envelope shape; applicant-key fallback) — no Claude lens reviewer raised either as a decision; user picked codex's option 1 verbatim. Plus unique absence defects (`through_quarter` test ownership, drift-gate determinism, transport pin vs hybrid fallback). Batch 2: 7 findings, 4 unique. Wrapper fidelity clean: one `codex exec` call, verbatim transcription, no re-judging. Sonnet→Haiku wrapper switch validated (42k → 5.5k tokens).
- **Opus lens reviewers: deep, on-lens, code-grounded.** contracts → firewall 422-vs-400 traced to `firewall.js` line ranges + `getApplicantCondition` vendor-key defect; gates → `parity:[]` populated by no task = vacuously green T11 hard gate (highest-value finding of the run); cross-task → SC-11 wrong cross-refs, deletion-vs-go/no-go contradiction. Batch-1 overlap moderate and healthy (2×firewall, 2×SC-11, 2×deletion ordering).
- **Reviser (Sonnet): quietly excellent.** 15 findings → 8 deduped clusters; adjudicated two CONFLICTING resolutions (deletion ordering) by the spec's Locked Decision #1 and flagged the conflict in `issues` instead of averaging.

### Process defects found (evidence-verified)

1. **Determined findings lost at the NEEDS_DECISION pause.** All-or-nothing return discarded ~13 batch-1 findings; the post-decision panel re-derived only ~half. Verified loss: SC-11 still said "(T13/T14)" at plan line 92 after the revise; also lost: parity-vacuous-gate, `through_quarter` ownership, drift determinism, transport pin, vendor-key defect.
2. **Post-decision full-panel redundancy.** 4/4 panelists re-reported resolution #1, 3/4 resolution #2 (~79k output tokens, one agent spent 31.5k spelling out edits two others also spelled out) — mechanical reviser work done by a panel.
3. **Superseded-spec waste (predecessor run `wf_7ed55d30`).** Planner + 12 reviewer agents + 2 human decisions burned on the superseded 07-20 spec; the banner surfaced only via the third AskUserQuestion. Nothing checked input freshness.
4. **Infra friction (no fix):** batch-1's three Opus reviewers each hit a ~40-min API stall (single gap 19:52→20:32 UTC between tool result and next assistant message); round-1 wall time 46 min vs 7 min for the identical panel shape after resume. Not reviewer inefficiency.
5. **Adherence nit:** entry session passed Workflow `args` as a JSON-encoded string both times despite `run-flow.md:27` forbidding it; script fallback saved it. No file change needed.

### Changes applied (2026-07-22, uncommitted, stacked on the codex-integration edits)

`workflows/run-review-flow.js`:
- NEEDS_DECISION return now includes `determined`; script accepts `args.carriedFindings` back on resume.
- Resume with `decisions` goes **reviser-first** (decisions phrased as apply-verbatim findings + carried findings), re-parses, enters loop at round-2 single reviewer — no panel re-run.
- Planner freshness guard: superseded/obsolete spec → empty `planPath` + `SUPERSEDED: …` summary; FAILED return surfaces that summary as `reason`.

`commands/exec/run-flow.md`:
- NEEDS_DECISION protocol: pass the result's `determined` list back verbatim as `carriedFindings` alongside `decisions`.

Kept as-is: the codex panelist (earn-out proven twice); UNAVAILABLE/quorum-drop path still untested (codex succeeded both times — watch the first CLI outage).

### Open items / cautions

- **Resume-cache footgun (transient):** runs launched before the 2026-07-22 edits execute their own persisted script copy; resuming one against the *edited* `run-review-flow.js` busts the planner cache (freshness-guard text changed) → full re-plan clobbering the revised plan. Resume pre-edit runs with their persisted script path, or only after plan review completes. New launches unaffected.
- Round-2 single reviewer of `wf_561ca1e8` was still running at evaluation time — whether it recovers the lost SC-11 / parity findings is unknown; worth checking on the next evaluation.
- Untested paths to watch next: codex UNAVAILABLE quorum-drop; the new reviser-first resume path (first exercise will be the next NEEDS_DECISION); code-review-phase panel (all evaluations so far covered plan review only).
