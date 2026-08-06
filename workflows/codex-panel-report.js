export const meta = {
  name: 'codex-panel-report',
  description: 'Report-only codex lens panel: 3 parallel codex reviewers over uncommitted changes — findings returned verbatim, no triage, no fixer',
  whenToUse: 'Launched by /exec:panel-report. Args: { planPath, repoRoot }. Read-only: codex runs under --sandbox read-only; the launcher writes the markdown report (the workflow sandbox has no file I/O).',
  phases: [
    { title: 'Code review', detail: '3 parallel codex lens panelists; findings transcribed verbatim, nothing modified' },
  ],
}

// Report-only extraction of review-flow-only.js's round-1 panel (first proven
// useful session b5253b31, 2026-08-04). Keep prompts in lockstep with that file —
// policy lives in review-loop.md / review-panel.md. Differences from the source:
// repoRoot is passed explicitly (the launching session's cwd may not be the repo)
// and each wrapper reports the exact codex command it ran so the launcher can
// verify the right repo was reviewed (a wrong -C path yields a false PASS).
const _args = typeof args === 'string' ? JSON.parse(args) : (args ?? {})
const planPath = _args.planPath
const repoRoot = _args.repoRoot
if (!planPath || !repoRoot) {
  return { status: 'FAILED', stage: 'input', reason: 'Invalid args: need planPath and repoRoot.' }
}

const CODEX_CODE_OUT = {
  type: 'object', required: ['verdict', 'codexCommand'],
  properties: {
    verdict: { enum: ['PASS', 'NEEDS_WORK', 'UNAVAILABLE'] },
    blocking: { type: 'array', items: { type: 'string' } },
    nits: { type: 'array', items: { type: 'string' } },
    codexCommand: { type: 'string' },
  },
}

const REALISM_RULE = `Realism floor: a blocking finding's failure scenario must be reachable by a realistic actor through the app's actual entry points — the UI as built or the documented API contract. Scenarios requiring inputs the UI cannot produce, concurrency the deployment does not actually exhibit, or data magnitudes outside the domain's real ranges are nits. Rigor machinery (locks, concurrency proofs, fault injection, extra precision handling) is warranted only where the spec/plan explicitly asks for it — an unrequested rigor upgrade is a nit, never blocking.`

const codexWrapperRules = (slug) => `Run codex in ONE Bash call with timeout 600000. The repo under review is ${repoRoot} — your own working directory is NOT the repo, so you MUST pass it to codex via -C: write the composed prompt to a temp file, then
   codex exec --sandbox read-only --ephemeral -C ${repoRoot} -o <tmpdir>/codex-review-${slug}.md - < <tmpdir>/codex-prompt-${slug}.md
The "-${slug}" filename suffix is MANDATORY — parallel panelists share the temp dir, and unsuffixed files get overwritten by the other reviewers mid-run.
Then read the output file and transcribe codex's findings VERBATIM into the structured output — do not re-judge, drop, merge, or add findings of your own.

If the codex CLI is missing, exits non-zero, produces no output file, or hits the timeout: return verdict UNAVAILABLE with all lists empty. Never invent a review, never retry more than once.`

// Lens keys must match the table in review-panel.md — definitions live there only.
const CODE_LENSES = ['correctness', 'resilience', 'tests']

function codexCodeReviewerPrompt(lens) {
  return `You are the thin wrapper for one of the cross-model Codex code panelists (wrapper contract: ~/.claude/commands/exec/review-panel.md, "The Codex panelist" section). You do NOT review any code yourself — codex is the reviewer; you only compose its prompt, run the CLI, and transcribe its report.

1. Read ~/.claude/commands/exec/review-panel.md and ~/.claude/commands/exec/review-loop.md in full.
2. Compose codex's prompt: review-loop.md's Step 1 reviewer prompt with {plan-file-path} = ${planPath} and no spec (omit spec-specific instructions). Add a lens line: codex is one of ${CODE_LENSES.length} parallel independent reviewers of the same diff and must run ALL the angles but dig deepest on the \`${lens}\` lens — copy that lens's full definition from review-panel.md's Lenses table into codex's prompt (codex cannot read ~/.claude), and tell it to report every blocking finding it sees regardless of lens. Also append this realism floor verbatim: "${REALISM_RULE}" Tell codex to report in review-loop.md's exact "### Review" format. The composed prompt must be fully self-contained: paste the Step 1 reviewer prompt text and lens definitions themselves — never instruct codex to read files under ~/.claude.
3. ${codexWrapperRules(`report-${lens}`)}

Structured output:
- verdict: PASS | NEEDS_WORK | UNAVAILABLE
- blocking: list of strings, one per blocking finding from codex's report — "file:line — what's wrong — the input/scenario that triggers it — expected fix"
- nits: list of strings
- codexCommand: the EXACT codex command line you executed, verbatim (empty string if codex was never run)`
}

phase('Code review')
const raw = await parallel(CODE_LENSES.map(l => () =>
  agent(codexCodeReviewerPrompt(l), { label: `codex:${l}`, model: 'haiku', phase: 'Code review', schema: CODEX_CODE_OUT })))

const up = raw.filter(p => p && p.verdict !== 'UNAVAILABLE').length
log(`codex lens panelists up: ${up}/${CODE_LENSES.length}`)

return {
  planPath,
  repoRoot,
  panel: CODE_LENSES.map((l, i) => ({ lens: l, result: raw[i] ?? { verdict: 'UNAVAILABLE', blocking: [], nits: [], codexCommand: '', note: 'wrapper agent died' } })),
}
