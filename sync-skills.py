#!/usr/bin/env python3
"""Sync ~/.agents/skills into the website.

Generates three things:
- site-src/skills/<name>/...   verbatim skill files (mkdocs source; the
  deploy workflow also copies this tree to /skills/ as raw fetchable files)
- site-src/skills/index.md     human-readable catalog page
- llms.txt                     llmstxt.org index of skills + docs

Excludes environment/build cruft: .venv, uv.lock, __pycache__, node_modules.
Run: uv --project site run sync-skills.py
"""

from __future__ import annotations

import shutil
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parent
SKILLS_DIR = Path.home() / ".agents" / "skills"
OUT_DIR = REPO / "site-src" / "skills"

EXCLUDE_DIRS = {".venv", "__pycache__", "node_modules", ".git"}
EXCLUDE_FILES = {"uv.lock"}
SITE_URL = "https://crow-ai.dev"
NAV_SENTINEL = "  # -- skills-nav: generated below by sync-skills.py, do not hand-edit --"


def frontmatter(path: Path) -> dict:
    text = path.read_text()
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end == -1:
        return {}
    return yaml.safe_load(text[3:end]) or {}


def copy_skill(src: Path, dst: Path) -> list[str]:
    """Copy a skill tree, returning the relative paths of copied files."""
    copied: list[str] = []
    for path in sorted(src.rglob("*")):
        rel = path.relative_to(src)
        if any(part in EXCLUDE_DIRS for part in rel.parts):
            continue
        if path.name in EXCLUDE_FILES:
            continue
        target = dst / rel
        if path.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
            copied.append(str(rel))
    return copied


def main() -> None:
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True)

    skills = []
    for skill_dir in sorted(p for p in SKILLS_DIR.iterdir() if p.is_dir()):
        name = skill_dir.name
        meta = frontmatter(skill_dir / "SKILL.md")
        files = copy_skill(skill_dir, OUT_DIR / name)
        skills.append(
            {
                "name": name,
                "description": " ".join((meta.get("description") or "").split()),
                "files": files,
            }
        )
        print(f"synced {name}: {len(files)} files")

    # ---- catalog page (mkdocs index for the skills section) ----
    lines = [
        "# Skills",
        "",
        "Workflow skills for crow-cli agents. Each skill is a directory with a",
        "`SKILL.md` that says when and how to use it. Agents load them on demand;",
        "you can read them here or fetch them raw:",
        "",
        "| skill | raw | files |",
        "| --- | --- | --- |",
    ]
    for s in skills:
        raw = f"[SKILL.md]({SITE_URL}/skills/{s['name']}/SKILL.md)"
        extras = ", ".join(
            f"[{f}]({SITE_URL}/skills/{s['name']}/{f})"
            for f in s["files"]
            if f != "SKILL.md"
        )
        lines.append(f"| [{s['name']}]({s['name']}/SKILL.md) | {raw} | {extras or '—'} |")
    lines.append("")
    for s in skills:
        lines += [f"## {s['name']}", "", s["description"], ""]
    (OUT_DIR / "index.md").write_text("\n".join(lines))

    # ---- mkdocs nav: rewrite the generated Skills section ----
    mkdocs_path = REPO / "mkdocs.yml"
    text = mkdocs_path.read_text()
    head, _, _ = text.partition(NAV_SENTINEL)
    nav = [NAV_SENTINEL, "  - Skills:", "      - Catalog: skills/index.md"]
    nav += [f"      - {s['name']}: skills/{s['name']}/SKILL.md" for s in skills]
    mkdocs_path.write_text(head + "\n".join(nav) + "\n")
    print(f"updated {mkdocs_path} nav")

    # ---- llms.txt ----
    llms = [
        "# crow-cli",
        "",
        "> crow-cli is a stateful ACP-native coding agent. Agents share a",
        "> persistent memory database, load workflow skills at runtime, and are",
        "> never offline: every agent has web_search and web_fetch.",
        "",
        "## Skills",
        "",
        f"- [Skills catalog]({SITE_URL}/docs/skills/): all skills with descriptions",
    ]
    for s in skills:
        llms.append(
            f"- [{s['name']}]({SITE_URL}/skills/{s['name']}/SKILL.md): {s['description']}"
        )
    llms += ["", "## Docs", ""]
    for page in sorted((REPO / "site-src").rglob("*.md")):
        rel = page.relative_to(REPO / "site-src")
        if rel.parts and rel.parts[0] == "skills":
            continue
        url = f"{SITE_URL}/docs/" if str(rel) == "index.md" else (
            f"{SITE_URL}/docs/{rel.with_suffix('')}/"
        )
        title = next(
            (l[2:] for l in page.read_text().splitlines() if l.startswith("# ")),
            rel.stem,
        )
        llms.append(f"- [{title}]({url})")
    llms.append("")
    (REPO / "llms.txt").write_text("\n".join(llms))
    print(f"wrote {OUT_DIR / 'index.md'} and {REPO / 'llms.txt'}")


if __name__ == "__main__":
    main()
