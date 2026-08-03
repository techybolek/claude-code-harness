# Harness Tuning Log — run-review-flow reviewer panel

Rolling log of reviewer/panel evaluations and the harness changes they produced. One entry per evaluation session, newest first.

> Entries 2026-07-22 → 2026-07-27 (the pre-rerun era: panel restructure, parse-plan, triage gate, meta-loop bans, the contaminated first A/B leg) are archived in `harness-tuning-log-archive-2026-07-22-to-27.md`. The archive's last entry lists the 7 fairness defects the rerun below was required to fix.

---

## 2026-08-02 — Retro-scoring the 07-29 `review-flow-only` run over the continue-dev leg: all-codex panel, 4/7 unique findings confirmed, fixer crashed on SSL — codex findings judged genuine; "continue-dev best" verdict stands but narrows

Retro evaluation (written 08-02) of the review that the 07-28 continue-dev eval's recommendation #1 asked for: session `d84521ee`, workflow `wf_1ee8af7c`, 07-29 16:54–17:24 CDT, `planPath: SPEC/ACTIVE/0001-admin-financial-override/plan.md`, against continue-dev's then-uncommitted main-repo tree. Companion doc: `2026-07-28-continue-dev-evaluation.md`.

**What ran — one round, not "2–3":** the perceived multiple review rounds were the **3 parallel codex panelists** (correctness / resilience / tests lenses; each "reviewer" agent an explicit thin wrapper — "You do NOT review any code yourself; codex is the reviewer", gpt-5.6-sol) plus a fixer crash+retry. Verify confirmed 4 / rejected 7; the round-1 fixer died on an SSL infra error with **zero edits applied**, the retry didn't complete, and the session was interrupted at the proceed-question. No round-2 re-review ever ran.

**Codex finding quality — 11 raw → 7 unique → 4 confirmed (57% precision), and the 4 are real:**
1. Mid-save row-switch race → **silently writes wrong source row** (dialog:112) — most severe; run-flow's committed leg had explicitly closed this exact race (`form.disable()`, captured `savingRowId`, version-selector guard).
2. Partial-success rebaseline → **duplicate audit row on retry** (dialog:121; 2/3 panelists independently) — run-flow's per-field rebaseline was cited as a *strength* in the A/B review.
3. **Sort dead on the audit log page** (column IDs ≠ row properties + `*ngIf`/`@ViewChild` timing; 2/3 panelists) — violates the F2 "sortable" AC outright; ralph's leg had the same defect class. Continue-dev's browser E2E rendered the page but never clicked a header — the eval's "residual gap" concern, confirmed.
4. Missing success toast (dialog:138) — minor but a real AC; the committed leg has the snackBar.

All 4 survived continue-dev's extensive self-verification (18 real-DB tests, live round-trips, browser E2E) — the review layer does work self-verification structurally cannot.

**The 3 rejects share one failure mode — spec-scope blindness:** codex demanded a filter UI, a forced-failure atomicity harness, and committed FE unit/E2E tests, all *explicitly disclaimed* by the tech spec — **despite a verbatim realism-floor clause in its prompt**. Verify killed all three with spec-line citations; zero noise reached the fixer. The prompt-side realism floor is demonstrably not the effective control — the verify stage is; keep it mandatory whenever codex panelists run.

**Verdict reconciliation:** no contradiction with "continue-dev best," but the quality edge narrows. Ralph (7) and run-flow (8) were scored *after* their pipelines' review/fix cycles; continue-dev's pre-fix defect surface (2 admin-only races, 1 broken AC, 1 missing toast, nothing portal-visible) sits between ralph's and run-flow's post-fix state — same rubric would plausibly land ~7.5–8, not clearly above run-flow. Efficiency + committed real-DB write tests still favor continue-dev. Net: the sharpest data point yet **for** the hybrid (capable-model single-context implement + independent cross-model review) — codex "kept finding fault" because the review layer was doing exactly the work the hybrid thesis assigns it.

**State:** the 4 confirmed findings were never fixed in continue-dev's tree (fixer crash), and that tree was never committed — moot only because the shipping candidate (`7464ed128` on `tro/304866-2`, run-flow lineage) already contains equivalents of all 4 fixes. The review's value ended up evaluative, not corrective.

### Open items
- [ ] Flow has no automatic resume for a crashed fix round (SSL death → retry also died → manual dead end). Consider one bounded auto-retry with backoff in the fixer stage.
- [ ] Codex realism-floor prompt clause ineffective (3/7 unique findings were exactly the disclaimed-rigor pattern) — rely on verify; optionally feed spec disclaimers (KISS/testing-strategy lines) into the codex prompt verbatim.
- [ ] This half-closes the "scored hybrid experiment" item from 07-28 (evening): calibration + this retro both support the hybrid; still missing a *fresh-feature* leg where fixes actually land and get re-scored.

---

## 2026-07-28 (evening) — Hybrid calibration: `review-flow-only` over ralph/0002 catches 3/4 known bugs incl. the portal column, plus 5 bugs both A/B reviewers missed (~$10-15, 35m, 11 agents)

Step-0 calibration for the hybrid experiment (session `50f727bb`, workflow `wf_5f47dee3-bea`, 22:37–23:12Z, run inside the ralph worktree with `planPath: SPEC/ACTIVE/0002-admin-financial-override/plan.md`). Ground truth = the 4 reviewer-confirmed bugs from the morning A/B.

**Caught & fixed:** portal empty ACTION column (the decisive cross-app bug — fixed via `determineColumns()` override filtering `editOnly` columns when no editProvider), dead log-page sort (@ViewChild setter), rollback-after-failed-begin. **Missed:** prototype-chain registry lookups (least severe of the 4; still open). **New finds beyond ground truth** (all missed by both fresh-context A/B reviewers): mid-save version-switch race (v1 edit posted against v2 row — fixed by capturing rowId/values pre-POST), duplicate audit rows on partial save + version switch (fixed), missing 1000-char reason cap (fixed + boundary tests, 21/21 live-DB), missing T-16 success toast (fixed), Close/Cancel enabled mid-save → stale table on committed override (**confirmed, unresolved — plateaued**; trivial `[disabled]="saving"` fix pending). Known write-path test gap re-flagged, triaged plan-deferred.

**Economics:** hybrid total ≈ $41–46 / ~101m vs run-flow $60 / 89m — ~25% cheaper, +12m wall clock, comparable-or-better outcome (this pass caught race classes run-flow's build was praised for closing). Validation correctly attributed the only failures (1 backend test, 5 tsc errors) to pre-existing baseline.

**State:** fixer changes UNCOMMITTED in the worktree (7 files, +80/−13). Pre-merge: commit fixes, apply the plateaued dialog fix, optionally add `hasOwnProperty` guard, do the 2-min visual portal check (now also verifies the column fix).

**Verdict:** hybrid thesis strongly supported at calibration. Remaining question for the scored experiment on a fresh feature: does post-hoc review match run-flow's hardening-by-construction when there's no known-bug safety net?

### Open items
- [ ] Commit ralph/0002 fixer changes; apply `[disabled]="saving"` close-control fix; hasOwnProperty guard.
- [ ] Scored hybrid experiment on next comparable feature (ralph → review-flow-only → same 2-reviewer rubric, per-stage cost/time).

---

## 2026-07-28 — Clean A/B rerun on admin-financial-override: run-flow wins quality (8 vs 7, portal-visible bug in ralph's build), ralph wins cost/time (~$31/66m vs ~$60/89m)

The rerun demanded by the 07-27 entry. Both legs started from the same spec pair (`SPEC/FEATURE-REQUEST/admin-financial-override-2026-07-24.md` + tech spec), fresh: **ralph first** (evening of 07-27: `ralph:strategic-plan` session `24bcfec4` at 20:33–20:43, then `ralph.sh` loop session `20260727-205530`, 4 iterations, 20:55–21:52, branch `ralph/0002-admin-financial-override`), **run-flow second** (morning of 07-28: `exec:run-flow` session `4cee5899`, workflow `wf_da4ae36b-29b`, 07:41–09:10, uncommitted on `dev`). Near-identical file layouts came out of both — genuinely comparable artifacts this time.

### Numbers

Cost model: published rates, 1h-cache writes (2×); reproduces the CLI's own $24.25 for the ralph loop within 1%.

| | Ralph (planner + loop) | run-flow (whole pipeline) |
|---|---|---|
| Wall clock | ~66 min (9m opus plan + 57m sonnet loop) | ~89 min (75m workflow + orchestrator head/tail) |
| Agents / sessions | 2 sessions, 1 context each | 1 orchestrator + 27 subagents (3 opus, 12 sonnet, 12 haiku) |
| Output tokens | 281k (56k plan + 225k loop) | 413k (38k orchestrator + 375k agents) |
| Cache writes / reads | 1.15M / 57M | 4.5M / 98M |
| Est. cost | **~$31** ($6.60 opus plan + $24.25 loop) | **~$60** ($4.26 orchestrator + $55.72 agents; excludes Codex-side panel usage) |

Cost-delta attribution: sonnet agent fleet $39.70 of which **$24.90 is pure cache reads (83M tokens)** — the price of 27 fresh contexts re-reading the repo vs ralph's four long single-context iterations. Opus share (plan + 2 plan-review revise rounds + reviser) $11.54. Haiku (parse, codex ferry, small stages) $4.43.

### Quality (two independent fresh-context reviewers, same 5-dimension rubric, both ran the suites live; full reports in `reviews/2026-07-28-ab-admin-financial-override-reviews.md`)

| Dimension | Ralph | run-flow |
|---|---|---|
| Spec fidelity | 8 | 9 |
| Correctness risks | 7 | 8 |
| Code quality | 8 | 8 |
| Test quality | 6 (19/19 pass) | 7 (26/26 pass) |
| Frontend quality | 6 | 8 |
| **Overall** | **7** | **8** |

**Decisive finding — the panel-class bug the 07-27 verdict predicted, in ralph's build:** ralph added the ACTION column unconditionally to the shared table constants (`pa-obligated-…-table-constants.ts:16`, `hmgp-…-table-constants.ts:14`), and `tp-table-base.component.ts` never filters it when `editProvider` is null → **the public portal renders a new empty column** on both tables. This is the exact constraint the spec flagged as the primary technical risk. The irony: it was introduced by ralph's (correctly self-diagnosed) iter-4 fix for the dead Edit action — a fix with no fresh-eyes review behind it. Ralph's E2E verified tp-admin (15/15 rows show the icon) but never re-checked the portal view. Run-flow gated the column conditionally and committed an empirical bundle proof (+892 B < 2 KB gate); its codex panel even raised (and triage correctly rejected as unreachable) an adjacent colspan finding — the review machinery was engaging exactly where ralph's defect landed. *(Needs a 2-minute visual portal check before treating as fully confirmed.)*

Ralph's other reviewer-confirmed bugs: dead sorting on the audit log page (`@ViewChild(MatSort)` vs `*ngIf`), prototype-chain registry lookups (`viewId="constructor"` → 500 not 400; `field="__proto__"` reaches SQL as `SET undefined = …`, MODIFY-gated so not injectable), rollback-after-failed-begin. Run-flow independently closed all three classes (`hasOwnProperty` guard, try/caught rollback, strict numeric validation). Run-flow's own bugs are milder: NULL money values make a row unsavable in the dialog; unchecked `rowsAffected` can write an audit row for a vanished row (inside the spec's accepted last-writer-wins posture).

**Shared gap, both harnesses:** neither committed a repeatable test of the core write transaction (atomic UPDATE + audit INSERT). Both delegate the write-path proof to ephemeral agent-driven E2E that leaves no artifact — a regression there passes CI in either build. Harness-level fix candidates: run-flow's validator should persist an RV evidence artifact; ralph's prompt should require one committed real-DB write+rollback test.

### 07-27 fairness-defect scorecard

1. **Model pin** — still not pinned in `ralph.sh`; this run happened to stay sonnet-5 for the whole loop (planner opus via strategic-plan). No mid-run switch, but the defect stands.
2. **Second-mover contamination** — order reversed (ralph first this time); run-flow generated its own plan from the raw spec. Clean enough.
3. **Worktree local-state** — FIXED: `setup_worktree_local_state` (skip-worktree propagation + per-project hook in `scripts/ralph/worktree-hooks/`) worked; E2E incl. ADFS ran without hand-copying.
4. **Iter-log clobber** — not fixed (still `ralph_claude_iterN.log`), but single-session run so nothing lost.
5. **Transient-error retry** — not fixed; no stall occurred this run.
6. **QA parity** — still the live question, and this run answered the 07-27 verdict: *the QA premium paid for itself.* Ralph shipped a portal-visible bug of exactly the class the panel catches; run-flow's panel + fix round cost ~$15–20 extra and avoided it.
7. **Post-run state** — clean this time; ralph restored all touched DB values (verified via direct query per its SUMMARY).

### Verdict

For features with a hard cross-app constraint (portal isolation here), run-flow's review stages are worth the ~2× cost. For self-contained backend work, ralph at half the price with committed-review appended (`review-flow-only` over the ralph branch) may be the better shape — that hybrid is now the obvious next experiment, and it also settles defect #6 by construction.

### Open items

- [ ] Visually confirm the empty ACTION column on the public portal build of ralph/0002 (2-min check).
- [ ] Decide the hybrid experiment: ralph implement → `review-flow-only` verify, scored against run-flow end-to-end.
- [ ] Both harnesses: require a committed real-DB write-transaction test (or persisted RV artifact) for audit-critical features.
- [ ] `ralph.sh`: pin model explicitly (DONE 2026-07-28: `RALPH_MODEL`, default `claude-sonnet-5`, passed via `--model`); timestamp iter logs; one retry on transient API death (defects 4, 5 still open). Also added 2026-07-28: Hard Invariants section in `strategic-plan.md` + binding rule in `AGENT_PROMPT.md` (re-verify invariants after self-initiated fixes).
- [ ] Run-flow cost lever: 83M sonnet cache-read tokens ($24.90) — consider narrower per-task file briefs or fewer/larger implementer tasks to cut re-reading.
