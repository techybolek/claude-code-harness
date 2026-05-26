---
name: wsl-firewall-diag
description: Diagnose network failures, hung commands, and silent timeouts on hardened WSL-2 distros that run a default-DROP outbound iptables firewall (Anthropic-style `init-firewall.sh` allow-list). TRIGGER when any network-dependent command (npm/npx install, pnpm install, pip install, docker pull, curl, wget, playwright install, gcloud auth, etc.) appears stuck, produces no output for >30s, times out at exactly 5s/8s/10s, or fails to connect to a remote host. ALSO use proactively before retrying any network-bound command that just failed — a retry without diagnosis is wasted minutes. SKIP for app-level errors (HTTP 4xx/5xx body), auth failures, JSON parse errors, or code bugs unrelated to the network path.
---

# WSL-2 Firewall Diagnostic

You may be running on a **hardened WSL-2 distro with a default-DROP outbound iptables firewall** fed by an allow-list (Anthropic's `init-firewall.sh` pattern). When a network-bound command stalls, the most likely cause is that the target hostname is **not on the allow-list** — SYN packets get blackholed and the caller waits its full timeout returning nothing useful.

The single most important rule:

> **Do not wait passively on a stuck network command. Do not "retry and see if it works." Run the diagnostic flow below first.**

A silent timeout on this distro is almost always a configuration fact (the host isn't allow-listed), not bad luck.

---

## Step 0 — Are you even on this kind of distro?

Run once at the start of any task that may need external network:

```bash
systemctl is-active init-firewall.service 2>/dev/null && echo "FIREWALL_ACTIVE" || echo "no firewall"
test -r /usr/local/sbin/init-firewall.sh && echo "SCRIPT_READABLE" || echo "no script"
```

If both lines confirm the firewall, treat any subsequent timeouts to remote hosts as **suspected firewall blocks until proven otherwise**.

---

## Step 1 — Recognize the symptoms

Treat **any** of the following as a firewall-block signal, not as "slow network":

| Symptom | Reading |
|---|---|
| `curl` returns `(28) Connection timeout after Nms` where N matches your `--connect-timeout` exactly | SYN was sent, no SYN-ACK ever came — packets are being silently dropped at the firewall |
| `ss -tnp` shows `SYN-SENT` for sockets owned by your stuck process | Same — TCP handshake never completes |
| A command runs >30s producing zero output (no progress bar, no log lines, no bytes downloaded) | Very likely blocked. Investigate, don't wait. |
| Same command failing in the same way after multiple retries | Allow-list state hasn't changed between retries; retries are wasted |
| `dig` resolves the host fine but `curl` to it times out | DNS is allowlisted; the destination host is not |

The firewall **drops silently** (no RST, no ICMP unreachable). That means: every blocked call burns its full timeout. Long blind waits are the worst possible response.

---

## Step 2 — Identify the blocked host

```bash
# Which sockets are stuck?
ss -tnp | grep SYN-SENT
# What hostnames is the process trying to reach? (look at its open FDs / strace if available)
ls -la /proc/<PID>/fd/ 2>&1 | head
# Probe the suspected host with a small fixed budget (NEVER use long curl timeouts here):
curl -sS --connect-timeout 5 -o /dev/null -w "%{http_code} ip=%{remote_ip} t=%{time_total}s\n" -I https://<host>/
# Resolve aliases — a single hostname can hop through several CDNs:
dig +short <host>
```

If `time_total` ≈ your `--connect-timeout` and `http_code` = `000`, that host is **firewalled**.

For tools that follow redirects (Playwright, Docker, gcloud), the **second or third hop** is usually the culprit. The first hop often goes through Azure FrontDoor (allowlisted), the binary distribution sits on a different CDN (Akamai, Google CS) that isn't. Always follow the full chain:

```bash
curl -sSLI --connect-timeout 5 --max-time 12 \
  -o /dev/null \
  -w "final_url=%{url_effective}\nfinal_ip=%{remote_ip}\nfinal_http=%{http_code}\n" \
  https://<entry-host>/
```

---

## Step 3 — Compare against the allow-list

The script is **world-readable** — no sudo needed:

```bash
grep -E "ALLOWED_DOMAINS|ALLOWED_IPS|ipset add|\".*\\.[a-z]+\"" /usr/local/sbin/init-firewall.sh
```

Beware: CIDR ranges fetched at boot (AWS CloudFront, AWS Global Accelerator, GitHub `/meta`) are NOT in the static script — they're materialized into the `allowed-domains` ipset at startup. The static lists are hostnames + a handful of IP CIDRs.

### Typical allow-list (Anthropic devcontainer template)

| Category | Coverage |
|---|---|
| Anthropic, Claude Code | `api.anthropic.com`, `claude.ai`, `statsig.anthropic.com`, `sentry.io` |
| Code hosts | `cli.github.com`, `ghcr.io`, GitHub IP CIDRs (api/web/git/packages/actions) |
| Package managers | `registry.npmjs.org`, `registry.yarnpkg.com`, `pypi.org`, `files.pythonhosted.org`, `bun.sh` |
| Linux package mirrors | `archive.ubuntu.com`, `security.ubuntu.com`, `ppa.launchpad.net`, `esm.ubuntu.com` |
| Container registries | Docker Hub (`registry-1.docker.io`, `auth.docker.io`, `index.docker.io`, `hub.docker.com`), `download.docker.com`, AWS CloudFront CIDRs (Docker Hub blobs), AWS Global Accelerator CIDRs (public ECR) |
| Microsoft (selected) | Azure FrontDoor edge `150.171.110.0/24` (`microsoft.com`, `code.visualstudio.com`), Fastly `146.75.106.0/24` (`vscode.download.prss.microsoft.com`), `marketplace.visualstudio.com`, `aka.ms` |
| Google (selected) | Google global LB `35.190.0.0/16` for `downloads.claude.ai` only |
| Stripe | `api.stripe.com` |
| LLM APIs | `api.groq.com`, `openrouter.ai`, `api.jina.ai` |

### Commonly NOT allowlisted — frequent culprits

| Host / range | Used by |
|---|---|
| `storage.googleapis.com` (`142.250.x.x`, `173.194.x.x`, `192.178.x.x`) | Playwright chromium binaries, gcloud SDK downloads, Chrome for Testing, many open-source release tarballs |
| `playwright.download.prss.microsoft.com` (Akamai `23.219.x.x`) | Playwright install (note: sibling `vscode.download.prss.microsoft.com` is allowlisted but lives on a different CDN — Fastly) |
| `googleapis.com`, `fonts.googleapis.com`, `www.google.com`, `google.com` | Anything Google-hosted |
| Akamai ranges (`23.192.0.0/11`) generally | Many enterprise download CDNs |
| `nodejs.org` mirror's actual binary CDN | Sometimes redirects to non-allowlisted edges |
| `huggingface.co` model blob CDN (`cdn-lfs.huggingface.co` → Cloudflare-fronted but specific edges may miss) | Model downloads |

If you confirm the blocked host is in this column, that's your answer — no retry will fix it.

---

## Step 4 — Take action; don't just keep waiting

Once a block is confirmed:

1. **Kill the stuck process** — let the user know what was stuck and where it was going.
   ```bash
   kill <pid>     # NOT kill -9 first — let the process clean up
   ```
2. **Decide between three remediation paths**, ordered by what the user can usually do fastest:
   - **A. Allow-list edit** (requires sudo from the user):
     ```bash
     # Edit /usr/local/sbin/init-firewall.sh — append the failing host(s) to ALLOWED_DOMAINS,
     # or a CIDR to ALLOWED_IPS. Then restart:
     sudo systemctl restart init-firewall.service
     # Verify (allow-list will resolve and ipset will repopulate):
     curl -sS --connect-timeout 5 -I https://<host>/
     ```
   - **B. Use an already-allowlisted equivalent** — e.g. use the system `chromium` from apt instead of Playwright's chromium download; use `pip` over `pypi.org` (allowlisted) instead of downloading wheels from random release URLs; use Docker Hub instead of public ECR if either has the image you need.
   - **C. Skip the network step and proceed** — write the code, run unit / non-network tests, document what's not yet verified end-to-end.

3. **Tell the user** which path you picked and why. Never silently retry the same blocked operation.

---

## Time budget

For any single host probe in this diagnostic, **5 seconds is the maximum `--connect-timeout`**. Do not use 30s/60s — the firewall drops fast, the timeout adds nothing. A 5-second result IS the answer.

For "is the install making progress" checks: **30 seconds with zero stdout/bytes-on-disk = stop and diagnose**. Don't grant another 5 minutes "to be sure".

---

## Patterns that LOOK like firewall but aren't

Don't misattribute. Use the right fix.

| Observation | Likely cause | Wrong move |
|---|---|---|
| Connection RST received | Upstream service blocked you, not the local firewall (this firewall drops silently → timeout, never RST) | Editing the local allow-list |
| HTTP 401 / 403 / 429 | Auth or rate-limit | Network diagnosis |
| DNS NXDOMAIN | Wrong hostname | Allow-list edit |
| `curl` succeeds in 0.3s but the application hangs after that | App-level issue (TLS handshake hung, app logic) | Network diagnosis |
| TCP RST after a successful handshake | Application-level disconnect / WAF | Network diagnosis |

---

## Worked examples (real findings on this distro)

### Playwright `npx playwright install chromium` hangs forever

- Hop 1: `cdn.playwright.dev` → Azure FD `150.171.110.x` ✅ (allowlisted) — 307 redirect comes back in 0.5s.
- Hop 2: `playwright.download.prss.microsoft.com` → Akamai `23.219.160.x` ❌ (Akamai NOT allowlisted; sibling `vscode.download.prss.microsoft.com` lives on Fastly which IS).
- Hop 3: `storage.googleapis.com` ❌ (Google CS NOT allowlisted) — the actual Chrome for Testing binary.
- **Fix:** add both hop-2 and hop-3 hosts to `ALLOWED_DOMAINS`, or install `chromium` via apt and point Playwright at the system binary via `launchOptions.executablePath`.

### Supabase `npx supabase start` initially times out pulling images

- Target: `public.ecr.aws/supabase/postgres:...` → AWS Global Accelerator anycast `99.83.x.x` / `75.2.x.x`.
- Initially fails with `dial tcp ... i/o timeout`; **eventually succeeds after retry**.
- Reason: AWS Global Accelerator CIDRs ARE in the allow-list (resolved at boot), but the anycast pool rotates, and the specific edge can take a moment to be reachable. ECR is a "patient retry" case — not the same class of failure as Google CS, which never works.

### `gcloud auth login` or `gcloud components install`

- Hits `*.googleapis.com` and `*.google.com` → blocked.
- No retry will fix this. Either allow-list `oauth2.googleapis.com` + `*.googleapis.com` + `dl.google.com`, or use a service-account JSON key offline.

---

## When sudo isn't available

The user must run any `sudo` step. Compose a one-shot patch they can run:

```bash
sudo tee -a /usr/local/sbin/init-firewall.sh >/dev/null <<'EOF'

# --- additional allow-list entries appended on YYYY-MM-DD ---
EOF
# (Better: open the file in $EDITOR and add to ALLOWED_DOMAINS array directly.)
sudo systemctl restart init-firewall.service
```

After the restart, `curl --connect-timeout 5` to the previously-blocked host should return a real status code.

---

## Pre-flight before any "long" network operation

Before you start something like `pnpm install`, `npx playwright install`, `docker pull`, `terraform init`, `helm pull`, ask yourself:

1. Are you on this distro? (Step 0)
2. Do you know what hosts this command will hit?
3. Are they on the allow-list (Step 3 grep)?

If 1 = yes and 3 = no/unknown, run a 5-second curl probe to the primary host first. A 5-second probe up-front is cheap; a 7-minute blind hang is not.
