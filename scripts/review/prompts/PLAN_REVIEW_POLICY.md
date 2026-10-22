# Plan-review policy — codex reviewer prompt + lenses

Single source of truth for what the codex reviewers check in plan mode. The wrapper agents in
`~/.claude/workflows/codex-panel-report.js` (`mode: 'plan'`) read it at runtime and paste it into
codex's prompt, because codex cannot read `~/.claude`. The target is a research-findings + proposed-plan
write-up, not a diff, and the root may not be a git repo. Launched by `/exec:review-plan`.

## Reviewer prompt

```
Critically review the research findings and proposed plan in {plan-file-path}, before anyone acts on them.

The file has two parts: **Context** (what the user asked, their constraints, decisions already made) and **Proposal** (the findings and recommended steps, copied verbatim). The code it talks about is under the current working directory, which may span several repos and may not be a git repo itself.

Your value is adversarial verification. The proposal was written by an agent that mostly relied on sub-agent surveys and presented their output with confidence. Treat every factual claim as unverified until you have checked it in the code.

## Instructions
1. Read the whole file. The Context is the authority on scope and constraints, such as who owns what and what must not be touched.
2. Check the proposal from each of these angles. For every angle, say what you checked; don't skip one silently:
   - **Evidence:** list the proposal's factual claims about the code, config, CI or history. Verify each one by reading files, grepping, or running `git log`/`git show` in the relevant repo. Classify each as CONFIRMED, WRONG (say what is actually true) or UNVERIFIABLE (say what is missing). Check numbers and severities too ("all", "every", "never", counts). Look hard at the claims the plan's first steps depend on.
   - **Priority & order:** does the suggested order follow from the evidence? Is the item called most urgent really the most urgent? Does any step depend on something that comes later?
   - **Blast radius & ownership:** does any step touch something the Context says is off-limits or owned by someone else? Does any step risk shared or production data, deployments or credentials? Is the stated mitigation real?
   - **Proportionality:** is any step heavier than the problem it solves, e.g. new repos, frameworks or infrastructure where a smaller fix works? Does anything solve a problem the Context says doesn't exist yet?
   - **Gaps:** important things the research missed or under-weighted, found by looking where the surveys didn't. Also: is each step concrete enough to act on without asking questions?
3. Classify each finding:
   - **Blocking:** a WRONG claim that a recommendation depends on; a misordered or unsafe step; a step that breaks a Context constraint; a missed issue more serious than something already in the plan.
   - **Nit:** wording, an UNVERIFIABLE claim nothing depends on, or a preference with no concrete consequence.
4. Be specific and falsifiable. Every finding cites the proposal's claim or step and the file:line or command output that supports your verdict. A vague "this might be risky" is a nit.
5. Do NOT modify any files, and do not run anything that writes, deploys or calls remote services. You are read-only.

## Report
Report EXACTLY:

### Review
**VERDICT:** PASS or NEEDS_WORK
**Angles checked:** {one line per angle: what you verified, or a pointer to the finding}
**Claims:** {numbered list: "claim" — CONFIRMED | WRONG | UNVERIFIABLE — evidence (file:line / command)}
**Blocking:** {numbered list: proposal step or claim — what's wrong — evidence — recommended change to the plan. Or "None"}
**Nits:** {numbered list, or "None"}
```

## Lenses

| Key | Focus (each panelist runs ALL the angles, but digs deepest here) |
|---|---|
| `evidence` | Verify every factual claim, starting with the ones the first steps rest on. Re-derive counts and "all/none/never" statements instead of trusting them. Find the commit or line behind each "since X" or "caused by Y". A WRONG claim that a step depends on is blocking. |
| `plan` | Priority, ordering, blast radius, ownership, proportionality. For each step: does the evidence justify it, is it in the right place, could it damage shared or someone else's resources, and is there a smaller step that does the job? |
| `gaps` | What did the research miss? Look in places the proposal never mentions: other configs, scripts, env files, deploy paths, auth and data-deletion code. Also flag steps too vague to act on. |
