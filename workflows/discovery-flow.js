export const meta = {
  name: 'discovery-flow',
  description: 'Discovery-to-PRD pipeline: research -> synthesis -> review -> consolidation, one fresh-context agent per phase',
  whenToUse: 'Launched by /spec:advanced-discovery once the interactive interview (phase 1) is done. Args: { projectRoot, projectName, startPhase? } — startPhase defaults to "research"; pass "synthesis"|"review"|"consolidation" to resume mid-pipeline. Phase 1 stays outside this workflow: it is a live conversation with the user, and workflow agents cannot hold one.',
  phases: [
    { title: 'Research' },
    { title: 'Synthesis' },
    { title: 'Review' },
    { title: 'Consolidation' },
  ],
}

// ---------- input ----------
const _args = typeof args === 'string' ? JSON.parse(args) : (args ?? {})
const projectRoot = _args.projectRoot
const projectName = _args.projectName
const startPhase = _args.startPhase || 'research'
if (!projectRoot || !projectName) {
  return { outcome: 'FAILED', reason: `Invalid args: need projectRoot and projectName (got ${JSON.stringify(_args)}). The launcher resolves the project name and runs the phase-1 interview before invoking this workflow.` }
}

const PHASES = [
  { key: 'research', title: 'Research', promptFile: 'PHASE_2_RESEARCH.md', inputs: ['01-interview.md'], output: '02-research.md' },
  { key: 'synthesis', title: 'Synthesis', promptFile: 'PHASE_3_SYNTHESIS.md', inputs: ['01-interview.md', '02-research.md'], output: '03-prd-draft.md' },
  { key: 'review', title: 'Review', promptFile: 'PHASE_4_REVIEW.md', inputs: ['03-prd-draft.md', '01-interview.md', '02-research.md'], output: '04-prd-review.md' },
  { key: 'consolidation', title: 'Consolidation', promptFile: 'PHASE_5_CONSOLIDATION.md', inputs: ['03-prd-draft.md', '04-prd-review.md'], output: '05-prd-final.md' },
]

const startIdx = PHASES.findIndex(p => p.key === startPhase)
if (startIdx === -1) {
  return { outcome: 'FAILED', reason: `Unknown startPhase "${startPhase}" — must be one of: ${PHASES.map(p => p.key).join(', ')}` }
}

// ---------- schema ----------
const PHASE_REPORT = {
  type: 'object', required: ['status'],
  properties: {
    status: { enum: ['done', 'blocked'] },
    summary: { type: 'string' },
    blocked_reason: { type: 'string' },
  },
}

// ---------- prompt ----------
function phasePrompt(p, retry) {
  const dir = `${projectRoot}/SPEC/DISCOVERY/${projectName}`
  const inputList = p.inputs.map(f => `- ${dir}/${f}`).join('\n')
  const retryNote = retry
    ? `\n\n## Retry notice\nA previous attempt at THIS phase died before reporting. Check whether ${dir}/${p.output} already has content before redoing the work.`
    : ''
  return `Discovery pipeline phase "${p.key}" for project "${projectName}". You have a fresh context: everything you need is below or in the files referenced.

## Output File
${dir}/${p.output}

## Instructions
Read your full instructions from: ~/.claude/scripts/discovery_agent/prompts/${p.promptFile}

## Input Documents
Read each of these in full before starting:
${inputList}

Follow the phase instructions exactly, then use the Write tool to save your output to exactly the Output File path above.

Then verify with \`ls -l\` that the Output File exists and is non-empty. Report status "done" ONLY after that check passes, with a one-paragraph summary of what you produced.

Report status "blocked" ONLY if a required input is missing/unreadable or the phase instructions call for a human decision you cannot make. In blocked_reason, name exactly what is needed — and if the missing input is another phase's output file, say which file, so the pipeline is resumed at the phase that produces it rather than at this one.${retryNote}`
}

// ---------- Phases ----------
let outcome = 'done'
let blockedReason = null
let failedPhase = null
const completed = []

for (let i = startIdx; i < PHASES.length; i++) {
  const p = PHASES[i]
  phase(p.title)
  let r = await agent(phasePrompt(p, false), { label: p.key, phase: p.title, schema: PHASE_REPORT })
  if (!r) {
    log(`${p.key}: agent died before reporting — one retry`)
    r = await agent(phasePrompt(p, true), { label: `${p.key} (retry)`, phase: p.title, schema: PHASE_REPORT })
  }
  if (!r) { outcome = 'agent_error'; failedPhase = p.key; break }

  log(`${p.key}: ${r.status} — ${(r.summary ?? '').slice(0, 140)}`)
  if (r.status === 'blocked') { outcome = 'blocked'; blockedReason = r.blocked_reason || r.summary; failedPhase = p.key; break }
  completed.push(p.key)
}

// ---------- Result ----------
const next = {
  done: `Verify ${projectRoot}/SPEC/DISCOVERY/${projectName}/05-prd-final.md exists, then hand it to the user.`,
  blocked: `Surface blockedReason to the user verbatim. After it's resolved, re-run /spec:advanced-discovery --project ${projectName} --resume ${failedPhase} — unless blockedReason names a missing input file, in which case resume at the phase that produces that file, not at ${failedPhase}.`,
  agent_error: `Phase agent died twice in a row (likely API outage). Re-run /spec:advanced-discovery --project ${projectName} --resume ${failedPhase} once the API is healthy.`,
}[outcome]

return { outcome, completed, blockedReason, failedPhase, projectRoot, projectName, next }
