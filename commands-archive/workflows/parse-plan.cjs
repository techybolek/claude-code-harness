#!/usr/bin/env node
// Deterministic plan parser for run-review-flow.js — run by the Parse-phase agent:
//   node ~/.claude/workflows/parse-plan.cjs <planPath>
// Prints one line of JSON:
//   {"ok":true,"tasks":[{id,title,files,dependsOn}...],"validationCommands":[...]}
//   {"ok":false,"reason":"..."} (exit 1) when the plan does not conform to the
//     template structure (`### T{N}: {title}` headings + bold bullet fields) — the
//     agent then falls back to model extraction.
// Output is a deliberate SKELETON: what/tests/doneWhen are parsed for validation but
// not printed — implementers read the full plan file themselves (by design), so the
// workflow only needs ids/titles for labels, files+dependsOn for wave/batch planning,
// and validationCommands verbatim for the validation agent.
'use strict'
const fs = require('fs')

function splitFilesField(v) {
  if (!v) return []
  let parts
  const ticked = v.match(/`[^`]+`/g)
  if (ticked) parts = ticked.map(s => s.slice(1, -1).trim()).filter(Boolean)
  else {
    parts = v.split(/[,;\n]+/)
      .map(s => s.replace(/\s*\([^)]*\)\s*$/, '').trim())
      .filter(s => s && s !== '-' && !/^(none|n\/a|tbd)$/i.test(s))
    // A plain (unbackticked) entry with internal whitespace is prose, not a path —
    // treat the whole field as unclear.
    if (parts.some(s => /\s/.test(s))) return []
  }
  // Resolve plan shorthand: a directory (`.../financial-override/`) or full path listed
  // once with bare filenames after it, and `.html`/`.scss` fragments meaning "the
  // previous file with this extension". Files feed the disjointness check in
  // planBatches, so every entry must resolve to one unambiguous repo path — any
  // unresolvable token makes the whole field [] (unclear → the task runs alone;
  // never risk false-disjoint parallelism on partial file lists).
  const files = []
  let dir = null
  for (const p of parts) {
    if (p.endsWith('/')) { dir = p; continue }
    if (/^\.[a-z0-9]+$/i.test(p)) {
      const prev = files[files.length - 1]
      if (!prev || !/\.[^./]+$/.test(prev)) return []
      files.push(prev.replace(/\.[^./]+$/, p))
    } else if (p.includes('/')) {
      files.push(p)
      dir = p.slice(0, p.lastIndexOf('/') + 1)
    } else {
      if (!dir) return []
      files.push(dir + p)
    }
  }
  return [...new Set(files)]
}

function extractValidationCommands(text) {
  const m = text.match(/^##\s+Validation Commands\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/m)
  if (!m) return []
  let body = m[1]
  const fences = [...body.matchAll(/```[^\n]*\n([\s\S]*?)```/g)]
  if (fences.length) body = fences.map(f => f[1]).join('\n')
  return body.split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('<') && !s.startsWith('```'))
}

function parsePlanText(raw) {
  const text = raw.replace(/\r\n/g, '\n')
  const headingRe = /^###\s+(T\d+)\s*:\s*(.*\S)\s*$/gm
  const heads = []
  for (let m; (m = headingRe.exec(text));) heads.push({ id: m[1], title: m[2].trim(), bodyStart: m.index + m[0].length })
  if (!heads.length) return null
  const FIELD_RE = /^\s*[-*]\s+\*\*(What|Files|Tests|Done when|Depends on)\s*:?\*\*\s*:?\s*(.*)$/i
  const tasks = heads.map(h => {
    const rest = text.slice(h.bodyStart)
    const endRel = rest.search(/^#{1,3}\s/m)
    const body = endRel === -1 ? rest : rest.slice(0, endRel)
    const fields = {}
    let cur = null
    for (const line of body.split('\n')) {
      const fm = line.match(FIELD_RE)
      if (fm) { cur = fm[1].toLowerCase(); fields[cur] = fm[2].trim() }
      // Continuation (sub-bullets/wrapped lines) only while contiguous — a blank line
      // ends capture so trailing section prose can't leak phantom "T{N}" deps in.
      else if (cur && line.trim()) fields[cur] += '\n' + line.trim()
      else cur = null
    }
    const deps = [...new Set((fields['depends on'] ?? '').match(/T\d+/g) ?? [])].filter(d => d !== h.id)
    return {
      id: h.id, title: h.title,
      what: fields.what ?? '',
      files: splitFilesField(fields.files),
      doneWhen: fields['done when'] ?? '',
      dependsOn: deps,
    }
  })
  return { tasks, validationCommands: extractValidationCommands(text) }
}

// Structural defects here mean a misparse (or a structure-breaking plan revision) —
// report ok:false so the agent hands the plan to model extraction instead.
function validate(p) {
  if (!p) return 'no `### T{N}: {title}` task headings found'
  const ids = new Set()
  for (const t of p.tasks) {
    if (ids.has(t.id)) return `duplicate task id ${t.id}`
    if (!t.title) return `${t.id}: empty title`
    if (!t.what) return `${t.id}: What field missing/empty`
    if (!t.doneWhen) return `${t.id}: Done when field missing/empty`
    ids.add(t.id)
  }
  for (const t of p.tasks) {
    const bad = t.dependsOn.find(d => !ids.has(d))
    if (bad) return `${t.id} depends on unknown task ${bad}`
  }
  return null
}

const planPath = process.argv[2]
if (!planPath) { console.log(JSON.stringify({ ok: false, reason: 'usage: parse-plan.cjs <planPath>' })); process.exit(1) }
try {
  const parsed = parsePlanText(fs.readFileSync(planPath, 'utf8'))
  const reason = validate(parsed)
  if (reason) { console.log(JSON.stringify({ ok: false, reason })); process.exit(1) }
  console.log(JSON.stringify({
    ok: true,
    tasks: parsed.tasks.map(t => ({ id: t.id, title: t.title, files: t.files, dependsOn: t.dependsOn })),
    validationCommands: parsed.validationCommands,
  }))
} catch (e) {
  console.log(JSON.stringify({ ok: false, reason: e.message }))
  process.exit(1)
}
