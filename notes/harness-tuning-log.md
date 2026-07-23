# Harness Tuning Log — run-review-flow reviewer panel

Rolling log of reviewer/panel evaluations and the harness changes they produced. One entry per evaluation session, newest first.

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
