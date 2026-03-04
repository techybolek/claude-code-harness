Show recent Claude Code projects with last activity summary.

## Steps

1. Write the following script to a temp file and run it:

```bash
cat > /tmp/recent_projects.js << 'SCRIPT'
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const base = path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'projects');
const dirs = fs.readdirSync(base).filter(d => {
  try { return fs.statSync(path.join(base, d)).isDirectory(); } catch { return false; }
});

const projects = [];
for (const dir of dirs) {
  const full = path.join(base, dir);
  let newest = null, newestMtime = 0;
  try {
    const files = fs.readdirSync(full).filter(f => f.endsWith('.jsonl'));
    for (const f of files) {
      const fp = path.join(full, f);
      const st = fs.statSync(fp);
      if (st.mtimeMs > newestMtime) { newestMtime = st.mtimeMs; newest = fp; }
    }
  } catch { continue; }
  if (newest) projects.push({ dir, newest, mtime: newestMtime });
}

projects.sort((a, b) => b.mtime - a.mtime);

const now = new Date();
const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
const yesterdayStart = todayStart - 86400000;

function git(cwd, args) {
  try {
    return execSync('git ' + args, { cwd, encoding: 'utf8', timeout: 5000, stdio: ['pipe','pipe','pipe'] }).trim();
  } catch { return ''; }
}

let lastGroup = '';
for (const p of projects.slice(0, 7)) {
  // Extract cwd and branch from session file
  const lines = fs.readFileSync(p.newest, 'utf8').split('\n').filter(Boolean);
  let branch = '', cwd = '';
  for (const line of lines) {
    try {
      const d = JSON.parse(line);
      if (d.cwd) cwd = d.cwd;
      if (d.gitBranch) branch = d.gitBranch;
    } catch {}
  }
  if (!cwd) continue;

  // Check if cwd exists and is a git repo
  try { fs.statSync(path.join(cwd, '.git')); } catch { continue; }

  // Time grouping
  let group;
  if (p.mtime >= todayStart) group = 'Today';
  else if (p.mtime >= yesterdayStart) group = 'Yesterday';
  else group = 'Earlier';

  if (group !== lastGroup) {
    if (lastGroup) console.log();
    console.log(group);
    lastGroup = group;
  }

  // Get branch if not found in session
  if (!branch) branch = git(cwd, 'rev-parse --abbrev-ref HEAD') || '?';

  // Format time
  const d = new Date(p.mtime);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  let timeStr;
  if (p.mtime >= todayStart) timeStr = hh + ':' + mm;
  else if (p.mtime >= yesterdayStart) timeStr = 'yesterday ' + hh + ':' + mm;
  else timeStr = d.toISOString().substring(0, 10);

  console.log();
  console.log('  ' + cwd + ' (' + branch + ') — ' + timeStr);

  // Uncommitted changes: modified + staged
  const diffStat = git(cwd, 'diff --stat --stat-width=60');
  const cachedStat = git(cwd, 'diff --cached --stat --stat-width=60');
  const untracked = git(cwd, 'ls-files --others --exclude-standard');

  const hasChanges = diffStat || cachedStat || untracked;
  if (hasChanges) {
    console.log('    Uncommitted:');
    if (cachedStat) {
      for (const line of cachedStat.split('\n').slice(0, -1)) {
        console.log('      S ' + line.trim());
      }
    }
    if (diffStat) {
      for (const line of diffStat.split('\n').slice(0, -1)) {
        console.log('      M ' + line.trim());
      }
    }
    if (untracked) {
      for (const f of untracked.split('\n').slice(0, 5)) {
        console.log('      ? ' + f);
      }
      const total = untracked.split('\n').length;
      if (total > 5) console.log('      ... +' + (total - 5) + ' more');
    }
  }

  // Recent commits (last 3)
  const log = git(cwd, 'log --oneline -3 --no-decorate');
  if (log) {
    console.log('    Recent commits:');
    for (const line of log.split('\n')) {
      const msg = line.replace(/^[a-f0-9]+ /, '');
      console.log('      · ' + msg);
    }
  }
}
SCRIPT
node /tmp/recent_projects.js
```

2. Present the output to the user as-is. Do not add commentary unless asked.
