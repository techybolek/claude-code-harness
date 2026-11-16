export const meta = {
  name: 'harness-steward',
  description: 'Harness steward: Haiku readers turn session digests into facts, one Fable agent diagnoses recurring harness causes and proposes fixes, prunes, reverts — read-only, nothing applied',
  whenToUse: 'Launched by /harness:steward. Args: { batches: string[][] (digest file paths per reader, from scripts/steward/steward.py extract), since: string, harnessRoot: string }. Returns proposals for the launcher to walk through with the user; applies nothing.',
  phases: [
    { title: 'Read', detail: 'one Haiku reader per digest batch → structured facts' },
    { title: 'Diagnose', detail: 'one Fable 5.2 agent: causes, prunes, ledger verdicts, proposals', model: 'claude-fable-5-2' },
  ],
}

const _args = typeof args === 'string' ? JSON.parse(args) : (args ?? {})
const { batches, since, harnessRoot } = _args
if (!Array.isArray(batches) || !since || !harnessRoot) {
  return { status: 'FAILED', reason: 'Invalid args: need batches (array of arrays), since, harnessRoot.' }
}

const FACTS = {
  type: 'object', required: ['facts'],
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object', required: ['kind', 'sessionId', 'summary', 'evidence'],
        properties: {
          kind: { enum: ['user_correction', 'interrupt_or_rejection', 'tool_error', 'workflow_failure', 'early_stop', 'stall', 'cost_hotspot', 'repeated_question', 'other'] },
          sessionId: { type: 'string' },
          project: { type: 'string' },
          summary: { type: 'string' },
          evidence: { type: 'string' },
          harnessArea: { type: 'string' },
        },
      },
    },
  },
}

const readerPrompt = (files) => `You extract evidence about how an AI coding harness (Claude Code with the user's custom commands, skills, workflows, CLAUDE.md and memories under ${harnessRoot}) performed. You do not judge or fix anything.

Read each of these session digest files in full:
${files.map(f => `- ${f}`).join('\n')}

Each digest lists, per session: models, tokens, tool errors, workflow runs, and the user's turns with the tail of the assistant message before each.

Return facts where the harness plausibly did the wrong thing or wasted effort:
- user_correction: the user corrected, redirected, pushed back, or expressed frustration ("no", "I didn't ask", "egh", "why did you…", repeating a request). This is the most important kind; capture every one.
- interrupt_or_rejection: [INTERRUPTED by user] or [TOOL CALL REJECTED by user].
- tool_error: recurring or blocking tool errors (not one-off typos).
- workflow_failure: workflow agents died/null, UNRESOLVED reviews, failed task notifications.
- early_stop, stall, cost_hotspot (very high output tokens for the work), repeated_question, other.

For each fact: sessionId (from the digest header), project path, a one-sentence summary, evidence = a short verbatim quote from the digest, harnessArea = the command/skill/workflow/rule involved if identifiable (e.g. "/ralph:ship", "review-flow-only", "CLAUDE.md conciseness"), else "".
Skip sessions where nothing went wrong. Do not invent facts. At most 40 facts per batch; if you had to drop some, add one 'other' fact saying how many and of what kind.`

phase('Read')
const read = await parallel(batches.map((files, i) => () =>
  agent(readerPrompt(files), { label: `read batch ${i + 1}/${batches.length}`, model: 'haiku', phase: 'Read', schema: FACTS })))
const deadBatches = read.map((r, i) => r ? null : i + 1).filter(Boolean)
const facts = read.filter(Boolean).flatMap(r => r.facts)
log(`facts: ${facts.length} from ${batches.length - deadBatches.length}/${batches.length} batches${deadBatches.length ? ` (dead: ${deadBatches.join(', ')})` : ''}`)

const PROPOSALS = {
  type: 'object', required: ['overview', 'proposals', 'ledgerVerdicts', 'tuningLogClosures'],
  properties: {
    overview: { type: 'string' },
    proposals: {
      type: 'array',
      items: {
        type: 'object', required: ['id', 'kind', 'title', 'cause', 'evidence', 'targetFile', 'edits', 'signal', 'expectedEffect'],
        properties: {
          id: { type: 'string' },
          kind: { enum: ['fix', 'prune', 'revert'] },
          title: { type: 'string' },
          cause: { type: 'string' },
          evidence: { type: 'array', items: { type: 'string' } },
          targetFile: { type: 'string' },
          edits: {
            type: 'array',
            items: { type: 'object', required: ['oldString', 'newString'], properties: { oldString: { type: 'string' }, newString: { type: 'string' } } },
          },
          signal: {
            type: 'object', required: ['name', 'howMeasured', 'baseline'],
            properties: { name: { type: 'string' }, howMeasured: { type: 'string' }, baseline: { type: 'string' } },
          },
          expectedEffect: { type: 'string' },
          adrDraft: {
            type: 'object', required: ['title', 'body'],
            properties: { title: { type: 'string' }, supersedes: { type: 'string' }, body: { type: 'string' } },
          },
        },
      },
    },
    ledgerVerdicts: {
      type: 'array',
      items: {
        type: 'object', required: ['entry', 'verdict', 'reason'],
        properties: { entry: { type: 'string' }, verdict: { enum: ['kept', 'revert_proposed', 'evaluating', 'confounded'] }, reason: { type: 'string' } },
      },
    },
    projectFriction: { type: 'array', items: { type: 'string' } },
    tuningLogClosures: {
      type: 'array',
      items: { type: 'object', required: ['item', 'evidence'], properties: { item: { type: 'string' }, evidence: { type: 'string' } } },
    },
  },
}

const diagnosePrompt = `You are the owner and long-term maintainer of this agent harness, and its design is up to you. The harness lives in ${harnessRoot}: CLAUDE.md, commands/, skills/, workflows/, scripts/, hooks/, settings.json, the memory directory ${harnessRoot}/projects/-home-tromanow--claude/memory/, adr/ (architecture decision records) and notes/.

Your job this run: find what keeps going wrong across the user's real sessions since ${since}, trace each recurring problem to the harness file that causes it, and propose small fixes. You propose; the user approves each change. You apply nothing.

## Inputs
1. Facts extracted from ${facts.length} session observations (below). user_correction facts are the strongest evidence that the harness did the wrong thing.
2. Read ${harnessRoot}/adr/index.md and every ADR relevant to a proposal. A proposal that contradicts an Accepted ADR must include adrDraft with supersedes set, and must say why the old reason no longer holds.
3. Read ${harnessRoot}/notes/steward-ledger.md if it exists: changes applied by earlier runs (with target signal and baseline) and proposals the user declined. Never re-propose a declined change unless new evidence is materially stronger; say so if you do.
4. Read ${harnessRoot}/notes/harness-tuning-log.md open items (unchecked boxes).
5. Read ${harnessRoot}/state/friction.jsonl if it exists; use entries with ts on or after ${since}. Each is a pipeline agent's own report of what cost it time. scope "harness" entries are evidence as strong as user_correction; entries from two different tasks naming the same cause satisfy the 2-session rule (cite as "task — what"). Entries with source "reflect" come from a deep review of one full session, which you cannot repeat: take the finding and its evidence as given and its wanted field as the recommended fix. One with systematic true is enough evidence on its own; a one-off needs the same cause in another session or entry. Before proposing a reflect fix, read the target file and skip it if the fix is already in place. scope "project" entries never become proposals: return them in projectFriction, one line per distinct cause as "project — cause — count".
6. Read any harness file you need. Session digests behind the facts are not available to you; work from the facts.

## What to produce
- proposals (at most 5, ranked by expected value):
  - fix: a recurring cause backed by evidence from at least 2 sessions (a single explicit standing instruction from the user also counts).
  - prune: stale cautions, contradictions, duplicated rules, or text written for older models in memories, CLAUDE.md, skills, commands or workflow prompts. "Never" rules without scope or reason count as candidates: rewrite with scope and reason, or move the rationale into an ADR.
  - revert: a ledger change whose signal got worse or did not move after at least 2 weeks of runs.
  Each proposal: exact edits to one targetFile as oldString/newString pairs copied verbatim from the file as it is now (oldString must occur exactly once; for a new file use oldString ""), evidence as "sessionId — quote" strings, the signal it should move with how to measure it from future session digests and its baseline value now, and the expected effect. Add adrDraft (title, body in the style of the existing ADRs) for any structural change.
  Prefer the highest enforcement layer that works: code or workflow logic over prose rules. Prefer deleting or tightening text over adding text.
- ledgerVerdicts: one per ledger entry still under evaluation: kept, revert_proposed (and include the revert in proposals), evaluating (too few runs), or confounded (the file was changed by hand since).
- tuningLogClosures: open tuning-log items the evidence now answers, with the evidence.
- overview: 3–5 plain sentences for the user: what went well, what keeps going wrong, what you propose.

If nothing recurs, return empty proposals and say so in the overview. Do not pad.

## Writing
Write for an intelligent but low-context reader who has not seen your tool calls or the files you opened. Put the key point first in every title and cause. Use plain words and full sentences; do not use terms you made up during the work.

## Facts
${JSON.stringify(facts)}`

phase('Diagnose')
let model = 'claude-fable-5-2'
let result = await agent(diagnosePrompt, { label: 'diagnose (Fable 5.2)', model, effort: 'high', phase: 'Diagnose', schema: PROPOSALS })
if (!result) {
  log('Fable diagnosis failed or was refused — falling back to Opus 5.5')
  model = 'claude-opus-5-5'
  result = await agent(diagnosePrompt, { label: 'diagnose (Opus 5.5 fallback)', model, effort: 'high', phase: 'Diagnose', schema: PROPOSALS })
}
if (!result) return { status: 'FAILED', reason: 'Diagnosis agent died on both models.', factsCount: facts.length, deadBatches }

return { status: 'OK', diagnosisModel: model, factsCount: facts.length, deadBatches, facts, ...result }
