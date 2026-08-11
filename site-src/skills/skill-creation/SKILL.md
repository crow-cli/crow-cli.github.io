---
name: skill-creation
description: Create new agent skills. Use when you notice a recurring task pattern
  that should be codified, or when the user asks to "make a skill" or "save this
  workflow." Skills are directories in ~/.agents/skills/ with a SKILL.md file.
---

# Creating Skills

## When to create a skill

- You've done the same multi-step task 2+ times
- The user says "we'll need to do this again"
- A workflow has docs + scripts that belong together
- Knowledge is currently in notes but should be available to ALL agents

## Structure

    ~/.agents/skills/<skill-name>/
    ├── SKILL.md          # Required: frontmatter + instructions
    ├── scripts/          # Optional: executable code
    ├── references/       # Optional: detailed docs
    └── assets/           # Optional: templates, configs

## SKILL.md format

    ---
    name: lowercase-hyphenated
    description: What it does AND when to use it. Max 1024 chars.
    ---

    # Instructions

    Step-by-step workflow...

## Rules

- name must match directory name
- description should include trigger keywords
- Keep SKILL.md under 500 lines; split into references/ if longer
- Scripts should be self-contained or document dependencies
- Use relative paths in file references

## Process

1. `mkdir -p ~/.agents/skills/<name>/`
2. Write SKILL.md with frontmatter + instructions
3. Add references/ for detailed docs
4. Add scripts/ for executable procedures
5. Test: start a new session, verify the skill appears in catalog

## Publishing

crow-ai.dev publishes this skills directory (raw at `/skills/<name>/...`,
rendered at `/docs/skills/`, indexed in `/llms.txt`) from the
`crow-cli/crow-cli.github.io` repo. A skill isn't real until it's on the site:

1. In `~/src/crow-team/crow-cli.github.io` (clone it if needed):
   `uv --project site run sync-skills.py` — copies `~/.agents/skills` into
   `site-src/skills/`, regenerates the catalog, nav, and `llms.txt`.
2. Eyeball `git diff`, commit, push, open a PR to `crow-cli/crow-cli.github.io`.
3. The deploy workflow ships it; verify at `crow-ai.dev/skills/<name>/SKILL.md`.

Never commit environment cruft — the sync excludes `.venv/`, `uv.lock`,
`__pycache__`. A `pyproject.toml` in the skill is the breadcrumb; agents
`uv sync` it themselves.
