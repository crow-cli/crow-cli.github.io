# TODO — crow-ai.dev docs & skills sprint

## **DO NOT ASK USER FOR FEEDBACK — THIS IS THE USER FEEDBACK.**
## **DO NOT ASK USER FOR NEXT STEPS — THESE ARE THE NEXT STEPS.**

User mandate (verbatim):
- Add a link to the navigation in the upper right of the landing page for the documentation.
- The documentation is super freaking wrong and needs to be updated based on what actually exists:
  - Actual installation setup (recommend building from source; crow-cli runs best as source
    code through uv; install scripts exist but are not recommended; part of the installation
    process = clone the monorepo into ~/.agents/crow/src/crow-cli and configure agent servers
    to run from there).
  - Thorough explanation of the configuration system.
  - Thorough walk through of all the different parts of the crow-cli CLI helper — the SKILL
    for crow-cli itself, told by walking down all the `crow-cli --help` options.
  - Explanation/walkthrough on setting up our fork of zed, which we recommend.
  - Configuring the services, LLM.
  - Skill creation now includes opening a PR for crow-cli/crow-cli.github.io; the
    skill-creation skill must reflect that.
  - `crow-cli init`/`crow-cli skills sync` to sync ~/.agents/skills with the site skills —
    OR (user's lean) prompt-based bootstrap: put crow-ai.dev/llms.txt in the system prompt as
    a jinja2 instruction for when skills are missing, agent fetches and installs what it needs.
    USER LEANS PROMPT-BASED. pyproject.toml is enough breadcrumbs for env setup; leave uv sync
    to the agent.

## Items

- [x] mkdocs-material site scaffold (done pre-sprint: mkdocs.yml, site-src/, sync-skills.py,
  llms.txt, brand CSS, awesome nav) — verified by local serve + screenshots 2026-08-11.
- [x] Landing page top nav: add Docs link (index.html .menu-links).
- [x] Rewrite installation.md: source-first via uv, clone monorepo to
  ~/.agents/crow/src/crow-cli, agent servers run from there; install.sh exists but not
  recommended. Verify: mkdocs build + eyeball; facts match `crow-cli --help`, pyproject.
- [x] New configuration.md: thorough config.yaml walkthrough (providers, models, mcpServers,
  services, memory_path/memory_port, embedding, skills_dir, system_prompt_path, override
  knobs, daemons: overrides). Verify: every documented key exists in configure.py/daemon.py.
- [x] New services.md: daemon lifecycle (start/stop/restart/status/install), services: block,
  health checks, unmanaged semantics, ollama-mv install. Verify: matches daemon.py + live
  `crow-cli daemon status`.
- [x] New cli.md: walk every subcommand (acp, init, auth, inspect, models, run, install,
  daemon + their subcommands) with real --help text. Verify: matches live --help output.
- [x] New zed.md: zed fork setup walkthrough (clone/build) + agent_servers config (registry
  entry + custom uv --project entry). Verify: matches user's real settings.json shape.
- [x] skill-creation SKILL.md: add publish flow = run sync-skills.py in crow-cli.github.io,
  commit, open PR to crow-cli/crow-cli.github.io. Verify: skill renders on site after re-sync.
- [x] System prompt bootstrap (crow-cli repo, defaults.py template + live
  ~/.agents/crow/prompts/system_prompt.jinja2): jinja2 else-branch when skills empty →
  fetch https://crow-ai.dev/llms.txt and install needed skills. Verify: render template with
  empty and non-empty skills; block appears only when empty; crow-cli unit tests pass.
- [x] sync-skills.py: docs section of llms.txt must list the new docs pages (generate from
  site-src tree, not hardcoded). Verify: llms.txt contains installation/configuration/
  services/cli/zed.
- [x] Delete stale docs/ (myst) dir; workflow already rewritten to mkdocs.
- [x] Local end-to-end: mkdocs build, serve, browse every new page + raw /skills file + llms.txt.
- [x] Commit + push crow-cli.github.io and crow-cli; verify GH deploy workflow green and live
  URLs 200: /docs/, /docs/skills/, /skills/use-uv/SKILL.md, /llms.txt, landing nav link.

## Deferred (written, not silently dropped)

- `crow-cli skills sync` / init-clones-monorepo code: deferred in favor of the prompt-based
  llms.txt bootstrap (user's stated lean). Docs describe the clone step manually.

## Follow-up 2026-08-11 — post-ship user feedback (landing rhetoric)

User mandate (verbatim gist): we totally built skills — excise the "didn't build skills"
rhetoric, point to the online skills, "open a PR to add to them today". And the Client
section must not be named Zed: call it Client, link agentclientprotocol.com's clients page,
offer our zed fork as preferred client, stress NO affiliation with Zed — it is just one of
many ACP clients on the market.

- [x] `#cli` section: delete the "Agent skills" row from the "What we didn't build" table;
  add a positive Skills block → catalog at /docs/skills/, machine-readable /llms.txt,
  "Open a PR to add to them today" linking crow-cli/crow-cli.github.io.
  Verify: `rg -n "Agent skills|didn't build" index.html` — only 3 legit neg rows remain.
- [x] `#what` section: h2 "Crow ADE" → "Client"; nav label "Crow ADE" → "Client". Copy:
  crow-cli speaks ACP (LSP for agents) and runs in ANY ACP client (link
  https://agentclientprotocol.com/get-started/clients); preferred client = our Zed fork
  (https://github.com/odellus/zed, /docs/zed/ setup guide); explicit no-affiliation-with-
  Zed-Industries disclaimer. Drop the stale Sidex/VS-Code-fork table rows (keep
  Transparent / Cancellable / Orchestration).
  Verify: `rg -in "zed|sidex|vs code" index.html` shows only intended mentions; hrefs 200.
- [x] Commit + push (Session-Id trailer); deploy workflow green; live landing shows new copy.


BUG REPORT:

got a 
```
Internal error: {
  "error": "memory error 413: Failed to buffer the request body: length limit exceeded"
}
```
from the agent after calling read_image_file.
