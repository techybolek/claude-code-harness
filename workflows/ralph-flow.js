export const meta = {
  name: 'ralph-flow',
  description: 'Ralph implement loop, workflow-native: sequential fresh-context iterations over a SPEC/ACTIVE task in a shared worktree, structured status instead of <ralph> markers',
  whenToUse: 'Launched by /ralph:flow. Args: { projectRoot, taskDir, worktreePath, maxIterations?, model? }. Review stage stays outside: on all_done the launcher runs ralph-pipeline.sh --skip-ralph (review-flow-only assumes its session cwd is the repo under review, which this workflow cannot guarantee).',
  phases: [
    { title: 'Implement', detail: 'loop-until-done; one fresh-context agent per iteration; structured item_done/all_done/blocked' },
  ],
}

// ---------- input ----------
// Workflow-native replacement for ralph.sh's bash loop (motivated by the
// 0002-e2e-portal-pages post-mortem, 2026-08-03): structured output kills the
// marker-grep spoof class by construction, agent() prompts never touch argv/ps,
// iteration history is journaled harness-side (no hand-written timestamps, no
// overwritten iter logs), and a dead agent gets one retry.
// AGENT_PROMPT.md remains the single source of the work contract; this script
// only overrides its transport-specific sections (markers, progress log) and
// adds the headless-execution rules the 0002 run showed agents need.
const _args = typeof args === 'string' ? JSON.parse(args) : (args ?? {})
const projectRoot = _args.projectRoot
const taskDir = _args.taskDir
const worktreePath = _args.worktreePath
const maxIterations = Number.isInteger(_args.maxIterations) && _args.maxIterations > 0 ? _args.maxIterations : 20
// Full model ID always — aliases like 'opus' silently resolve to the session
// model since CLI 2.1.219.
const model = typeof _args.model === 'string' && _args.model ? _args.model : 'claude-sonnet-5'
if (!projectRoot || !taskDir || !worktreePath) {
  return { status: 'FAILED', stage: 'input', reason: `Invalid args: need projectRoot, taskDir, worktreePath (got ${JSON.stringify(_args)}). The launcher runs worktree-setup.sh first and passes its output.` }
}

// ---------- schema ----------
const ITER_REPORT = {
  type: 'object', required: ['status', 'summary'],
  properties: {
    status: { enum: ['item_done', 'all_done', 'blocked'] },
    summary: { type: 'string' },
    items_completed: { type: 'array', items: { type: 'string' } },
    commit_sha: { type: 'string' },
    tests_written: { type: 'number' },
    tests_passed: { type: 'number' },
    regression_passed: { type: ['boolean', 'null'] },
    blocked_reason: { type: 'string' },
  },
}

// ---------- prompt ----------
function iterPrompt(i, history) {
  const historyBlock = history.length
    ? `## Prior iterations (orchestrator-recorded — this replaces reviewing ralph_progress.txt)
${history.map(h => `- iter ${h.iteration}: ${h.status}${h.commit_sha ? ` (commit ${h.commit_sha})` : ''} — ${h.summary}`).join('\n')}`
    : `## Prior iterations
None — this is iteration 1. Do NOT run the full suite at startup — it runs exactly once, right before all_done (per AGENT_PROMPT).`

  return `You are iteration ${i} of the Ralph loop (workflow-native transport) for task ${taskDir}. You have a fresh context: everything you need is in the task docs, git history, and the prior-iteration list below.

Read ~/.claude/scripts/ralph/prompts/AGENT_PROMPT.md IN FULL and follow it, with these BINDING overrides:

## Paths
- Working tree (the ONLY place you modify code): ${worktreePath} — branch ralph/${taskDir}. Your default cwd is NOT the worktree: cd there explicitly in every Bash call.
- Task docs (SPEC/ is gitignored and exists only in the main checkout): ${projectRoot}/SPEC/ACTIVE/${taskDir}/{plan,tasks,context}.md. Update tasks.md and context.md there per AGENT_PROMPT Phase 5.
- Modify nothing else under ${projectRoot}. Starting/restarting shared dev services (backend, ng serve, project skills like restart-backend) is allowed and encouraged when the environment is down.

## Output contract — replaces AGENT_PROMPT's OUTPUT MARKERS section
Do NOT print <ralph>...</ralph> markers; they are inert here. Return structured output instead:
- status: "item_done" (this iteration's selected items complete and committed; more tasks.md items remain) | "all_done" (every tasks.md item checked, SUMMARY.md written, all work committed) | "blocked" (AGENT_PROMPT's Unrecoverable cases)
- summary: what you completed and HOW you verified it (same content AGENT_PROMPT's completion report asks for)
- items_completed (task ids, e.g. ["P1-2","P1-3"]), commit_sha, tests_written, tests_passed, regression_passed (null if not run), blocked_reason (blocked only)

## Progress log — replaces AGENT_PROMPT's PROGRESS LOG section
Do NOT write .runs/*/ralph_progress.txt and do NOT invent timestamps — the orchestrator records iteration history with real clocks (you are reading that record above).

## Headless-execution rules (BINDING — a prior run died to each of these)
- Your session dies the moment your final turn ends: background Bash tasks are killed mid-run, and ScheduleWakeup / task notifications will NEVER re-invoke you. Never end your turn while anything you started is still running.
- Run ALL verification in the FOREGROUND. Chunk long gates into sequential foreground commands, each under the 10-minute Bash timeout — e.g. a "suite green 5×" gate is five separate foreground runs checked one at a time, never one 20-minute background loop.
- git commit completed work BEFORE starting any long verification run, so a crash cannot orphan it.
- status "all_done" is valid ONLY after ${worktreePath}/.runs/${taskDir}/SUMMARY.md exists AND git status in the worktree shows no uncommitted source changes.
- Before returning "blocked", attempt self-provisioning (restart the backend, start dev servers, use project skills). Only genuinely human-only steps (VPN connection, credentials) justify blocked — name the exact human action in blocked_reason.

${historyBlock}`
}

// ---------- Phase: Implement ----------
phase('Implement')
const history = []
let outcome = 'max_iterations'
let blockedReason = null

for (let i = 1; i <= maxIterations; i++) {
  let r = await agent(iterPrompt(i, history), { label: `iter ${i}`, phase: 'Implement', model, schema: ITER_REPORT })
  if (!r) {
    // One retry on transient agent death (open item from the tuning log —
    // ralph.sh never had this). The retry prompt warns about partial work.
    log(`iter ${i}: agent died before reporting — one retry`)
    r = await agent(
      iterPrompt(i, history) + `\n\n## Retry notice\nA previous attempt at THIS iteration died before reporting. Check git log and tasks.md for partial work it may have left (committed or uncommitted) before redoing anything.`,
      { label: `iter ${i} (retry)`, phase: 'Implement', model, schema: ITER_REPORT })
  }
  if (!r) { outcome = 'agent_error'; break }

  history.push({ iteration: i, status: r.status, summary: r.summary, commit_sha: r.commit_sha ?? null, items_completed: r.items_completed ?? [] })
  log(`iter ${i}: ${r.status}${r.commit_sha ? ` @ ${r.commit_sha}` : ''} — ${(r.summary ?? '').slice(0, 140)}`)

  if (r.status === 'all_done') { outcome = 'all_done'; break }
  if (r.status === 'blocked') { outcome = 'blocked'; blockedReason = r.blocked_reason || r.summary; break }
}

// ---------- Result ----------
const next = {
  all_done: `Verify ${worktreePath}/.runs/${taskDir}/SUMMARY.md exists and the worktree is clean, then run the review stage in a BACKGROUND Bash task (it exceeds the foreground timeout): cd ${projectRoot} && RALPH_TASK=${taskDir} ~/.claude/scripts/ralph/ralph-pipeline.sh --skip-ralph`,
  blocked: `Surface blockedReason to the user verbatim. After the human resolves it, re-run /ralph:flow — on-disk state (tasks.md checkboxes, commits) carries; no resume machinery needed.`,
  max_iterations: `Re-run /ralph:flow to continue — tasks.md checkboxes and commits carry the state.`,
  agent_error: `Iteration agent died twice in a row (likely API outage). Re-run /ralph:flow once the API is healthy.`,
}[outcome]

return { outcome, iterations: history.length, blockedReason, history, projectRoot, taskDir, worktreePath, next }
