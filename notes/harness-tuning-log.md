# Harness Tuning Log — run-review-flow reviewer panel

Rolling log of reviewer/panel evaluations and the harness changes they produced. One entry per evaluation session, newest first.

> Entries 2026-07-22 → 2026-07-27 (the pre-rerun era: panel restructure, parse-plan, triage gate, meta-loop bans, the contaminated first A/B leg) are archived in `harness-tuning-log-archive-2026-07-22-to-27.md`. The archive's last entry lists the 7 fairness defects the rerun below was required to fix.

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
- [ ] `ralph.sh`: pin model explicitly; timestamp iter logs; one retry on transient API death (defects 1, 4, 5 — all still open).
- [ ] Run-flow cost lever: 83M sonnet cache-read tokens ($24.90) — consider narrower per-task file briefs or fewer/larger implementer tasks to cut re-reading.
