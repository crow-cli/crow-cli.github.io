---
name: upstream-merge
description: >-
  Tactically merge upstream zed-industries/zed changes into the crow
  fork without losing crow's character. Use when the user says "merge upstream",
  "pull from zed", "sync with upstream", "rebase crow", "bring in upstream
  changes", or "what did upstream do". Fetches upstream, triages incoming commits
  by which protected crow area they touch, merges per-category, and runs the
  gate (build + rebrand-integrity scan + crow characterization tests) so no merge
  can silently revert crow -> zed. Strategy doc:
  ~/.agents/notes/dev/crow-upstream-merge-strategy.md
---

# Upstream merge (crow <- zed)

crow is a fork of `zed-industries/zed`. Dev branch: `acp-v2`; PRs target `main`.
Remotes: `origin` = odellus/zed (ours), `upstream` = zed-industries/zed.

**Prime directive:** never let a merge silently revert crow -> zed. Upstream's
tests passing is NOT enough — a `Crow`->`Zed` string revert compiles clean. The
gate is the fitness function; only fit merges reach `main`.

## The divergence model (know what you're protecting)

| Cat | What | Risk | Protect via |
|-----|------|------|-------------|
| **A** net-new crow files | the product (`agent_ui/workspace_agent_threads.rs`, `agent_ui/agent_thread_item.rs`, `client/atproto_auth.rs`, `mock_pds.py`) | ~none | presence/registration tests; never delete |
| **B** rewired shared files | ACP-panel UI + auth gut (`agent_ui/agent_panel.rs`, `agent_ui/agent_ui.rs`, `client/client.rs`, `client/user.rs`, `http_client`) | **high** | characterization tests on behavior |
| **C** cosmetic rebrand | "Zed"->"Crow" across ~80 files + icons | high-freq, silent | grep integrity scan |
| **D** feature | typst preview | low | localized tests |

Full protected path list: `references/protected-files.md`.

## Procedure

### 1. Fetch and measure
```bash
cd <zed repo>
git fetch upstream --tags --force --quiet
git rev-list --count HEAD..upstream/main          # how far behind
git merge-base HEAD upstream/main                 # our fork point
```
`script/upstream-watch` already digests this daily to
`~/.agents/notes/dev/upstream-zed-digest.md` — read it first.

### 2. Triage incoming commits by protected area
```bash
git --no-pager log --oneline HEAD..upstream/main
# which protected files does the incoming work touch?
git --no-pager diff --name-only HEAD...upstream/main > /tmp/incoming.txt
grep -Ff <(sed -n 's/^  - //p' references/protected-files.md) /tmp/incoming.txt
```
Bucket the incoming commits:
- touches only **unprotected** files -> safe, merge freely.
- touches **C** (rebrand strings) -> expect trivial conflicts; re-assert "Crow" after.
- touches **B** (agent_panel/client/http_client) -> real merge work; read the upstream change, preserve crow's rewiring.
- touches **A** paths -> should be ~never (upstream doesn't have them); if it adds a same-named file, STOP and review.

### 3. Merge
Prefer a merge commit over rebase (keeps crow's 6 commits intact, history honest):
```bash
git merge upstream/main            # or a cherry-picked subset for surgical pulls
```
Resolve conflicts in favor of crow's character for B/C, then:

### 4. Run the gate (NON-NEGOTIABLE)
```bash
script/crow-merge-gate             # see "The gate" below
```
- **Pass** -> commit/keep the merge.
- **Fail** -> `git merge --abort` (or reset), dump the failing guard + diff. Do
  NOT push red. A guard may only be overridden if the merge *replaces* the
  behavior with a superior method that still satisfies the guard's intent —
  that's a human/judged call, never auto-approved.

### 5. (Future) Open PR against main
Once gated-green, the agent opens a PR `acp-v2`->`main`. Human reviews the PR,
not the raw merge. Eventually cron launches this whole flow; the gate is the
selection pressure that lets it be safe.

## The gate (`script/crow-merge-gate`)

Passes iff ALL hold:
1. `cargo check` workspace clean.
2. **Rebrand integrity:** no `Zed` / `zed.dev` / cloud-URL resurrection in
   Category-C files (grep against manifest). Icons re-asserted (checksum).
3. **Crow characterization tests** pass (Category A/B/D behavior guards).
4. **Crown jewels present:** Category-A paths exist and are registered.

Status: gate script + characterization tests are TODO — see strategy doc "Open
decisions" for the proposed fitness-function seed. Until they exist, run steps
1-2 by hand and eyeball B.

## Rules of engagement

- Merge often, merge small. A 20-commit tactical merge beats a 200-commit catch-up.
- Never `git revert` crow work to "make the merge clean."
- A clean compile is necessary, never sufficient.
- When upstream and crow both touched a B-file, understand upstream's *intent*
  before resolving — sometimes their fix is good and we want it, adapted.
