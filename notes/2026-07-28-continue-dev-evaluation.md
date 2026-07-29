# continue-dev evaluation — admin-financial-override, third leg (2026-07-28)

Session `65df655c-fd20-483e-a899-595117d01aa8` (`~/PROJECTS/TP/TPV2`), named **continue-dev**.
One `/ralph:continue-dev` invocation, 2026-07-28 20:20–21:04 EDT. Companion to the A/B entry in
[harness-tuning-log.md](harness-tuning-log.md) (2026-07-28 rerun); this doc is the standalone write-up.

## Verdict

**Genuine, high-quality completion.** All 7 phases of `SPEC/ACTIVE/0001-admin-financial-override`
finished in **43 minutes, one context, zero mid-run user input** (the lone "continue" was queued 56s
in, before any stall). Verification was real, not claimed:

- 18-test real-DB mocha suite (`tp/test/admin/test_financialOverride.js`), incl. rollback → 0 orphan audit rows
- Live write-path round-trip: override → audit row inspected (`old_value` == pre-edit) → value restored
- HI-4 bundle isolation proven empirically: grep of portal bundle + `git stash` baseline build → **delta 1,322 B < 2 KB**
- Browser E2E via playwright-cli (minted MODIFY JWT as cookie): 15 Edit buttons, dialog + reason-gate (T-17),
  full UI edit → POST 200 → audit row 136 (T-16/HI-2), log page (T-22); screenshots in the task folder
- Two spec-vs-reality deltas documented (D-6 mocha glob naming, D-7 append-only audit table);
  nothing committed — left on `tro/304783-2` for review

**Avoided ralph's decisive bug by design:** instead of adding the ACTION column unconditionally to
shared table constants (ralph's portal-visible defect), it built a `displayedColumnNames` getter that
appends the edit column only when `editProvider` is provided, then proved isolation empirically.

**Closed the shared gap** flagged for *both* harnesses in the 07-28 log entry: a committed, repeatable
real-DB write-transaction test now exists — unprompted.

## Numbers — same feature, three legs

| | Ralph (07-27 rerun) | run-flow (07-28) | **continue-dev (07-28)** |
|---|---|---|---|
| Shape | opus plan + 4 fresh-context sonnet iterations | 1 orchestrator + 27 subagents | **1 session, 1 context** |
| Model | sonnet-5 loop (pinned) | mixed (3 opus / 12 sonnet / 12 haiku) | **opus-4-8 throughout (inherited session model)** |
| Wall clock | ~66 min | ~89 min | **~43 min** |
| Output tokens | 281k | 413k | **304k** |
| Cache W / R | 1.15M / 57M | 4.5M / 98M | **0.69M / 64.9M** |
| Est. cost | ~$31 | ~$60 | **~$47** ($7.6 out + $32.5 cache-read + $6.9 cache-write; opus-4-8 $5/$25, 1h-TTL writes 2×, reads 0.1×) |
| Quality (2-reviewer rubric) | 7 — portal-visible bug | 8 | **unreviewed** (self-verified only) |
| Committed real-DB write test | ❌ | ❌ | **✅ (18 tests incl. rollback)** |

## Why it completed in one session

1. **Model confound — the big one.** Ralph pins `RALPH_MODEL=claude-sonnet-5`; continue-dev silently
   inherited **opus-4-8**. This is as much opus-vs-sonnet as command-vs-command. Ralph's iter-4 bug came
   from a self-diagnosed fix with no fresh-eyes review; the opus single-context run got the isolation
   design right first pass.
2. **Single context beats fresh-context resets when the task fits.** With the 1h prompt cache and ~170k
   average context per call, this feature never needed a reset. Cache reads (64.9M) landed between
   ralph (57M) and run-flow (98M) — one long context re-reads its own history but never the repo from scratch.
3. **The plan was pre-paid.** continue-dev consumed the ralph-authored `plan.md`/`tasks.md`/`context.md`.
   It is not a ralph replacement; it's ralph's execution phase collapsed into one iteration.

**Interpretation:** accidentally the strongest data point yet for the hybrid the tuning log already
wanted — capable-model single-context implement + independent review — at ~half run-flow's cost and
~2/3 of either leg's wall clock. **Provisional** until the same reviewer rubric runs on `tro/304783-2`.

## Residual gaps

- Public **portal build verified at bundle level only, never visually** — same class of miss as ralph's
  (much lower risk here given the conditional getter + AOT builds), and the same 2-minute check remains
  open across all three legs.
- Quality score not comparable until the 2-fresh-context-reviewer rubric runs.
- Benign leftovers: audit rows 135/136 in UAT (append-only by design, documented).

## Friction (all recovered, ~2–3 min waste)

- `db-ops` skill failed ×2 (exit 127): quick-start path `.claude/skills/db-ops/scripts/dbq.sh` is
  repo-root-relative; the shell's persistent cwd was `backend/` from earlier `cd backend &&` commands.
- One background backend start failed exit 1 (`cd: backend` while already in `backend/`) — same class.
- `sleep 30 && tail` poll hook-blocked; agent adapted to bounded probes.
- Post-completion the background backend process died (DB/VPN blip); correctly triaged as harmless.

## Adherence notes

- CLAUDE.md "real tests over mocks": fully honored (live UAT DB, real JWT, real browser).
- `continue-dev.md` Step 7 says "always ask before architectural decisions" — the session asked nothing
  and ran fully autonomously (matches actual usage; the command text conflicts).
- Step 6.5 demands browser verification for *any* task; the session sensibly verified backend phases
  A–C via curl + mocha and reserved the browser for D–G.
- TaskCreate/TaskUpdate phase tracking, memory writes for two non-obvious lessons (MODIFY-JWT mint,
  base-`@Component` DI-token AOT gotcha) — both good practice.

## Recommendations (none applied — confirm-first)

1. **[next step] Score, then log.** Run the same 2-reviewer rubric (or `review-flow-only` with the plan
   path) against `tro/304783-2`; add this leg's numbers to harness-tuning-log.md. Half-answers the log's
   open "hybrid experiment" item.
2. **[command] Pin or record the model in `continue-dev.md`** — ralph pins, continue-dev inherits;
   silently confounds every cross-harness comparison. Minimum: record the session model in context.md's
   SESSION PROGRESS entry.
3. **[skill] `db-ops` cwd fragility** (`TPV2/.claude/skills/db-ops/SKILL.md:13`): anchor the script path,
   e.g. `"$(git rev-parse --show-toplevel)/.claude/skills/db-ops/scripts/dbq.sh"`, plus a one-line
   persistent-cwd warning.
4. **[command] Reconcile Step 7 with autonomous use** — soften to "ask only for destructive/scope-changing
   decisions; otherwise decide and record rationale in context.md", or mark it interactive-mode-only.
5. **[command] Codify the backend carve-out in Step 6.5** — "backend-only tasks: live API verification
   (curl/integration suite) satisfies this step; browser verification required once a UI surface exists."
6. **[ralph] Lift the committed write-test pattern into `AGENT_PROMPT.md`** — continue-dev produced it
   unprompted; ralph still lacks it (open item from the 07-28 entry).
