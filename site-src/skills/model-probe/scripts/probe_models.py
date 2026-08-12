"""Probe configured models with a REAL image and print the raw evidence.

The script does not decide anything. It sends the bundled probe image (known
ground truth) to every configured model and prints, per model: HTTP status,
a heuristic SUGGESTION, and the model's raw answer. The agent reading the
table makes the final modality call (and web-searches anything surprising)
before writing config.yaml back via apply_modalities() — see SKILL.md.

Why content-judging instead of status codes (all observed live):
- /v1/models exposes no capability metadata on OpenAI-compatible gateways.
- Text-only gateways silently DROP image blocks: 200 + honest refusal, empty
  content, or a confident hallucination.
- Vision models may 400 a malformed probe image (e.g. 1x1 px) while being
  perfectly vision-capable.

Ground truth for assets/probe-image.png: indigo/purple field, white "crow"
wordmark, white crow/bird silhouette.

Run inside the skill's uv project:
    uv --project ~/.agents/skills/model-probe run python scripts/probe_models.py
    uv --project ... run python scripts/probe_models.py --provider alibaba
"""

from __future__ import annotations

import argparse
import base64
import re
import sys
from pathlib import Path

from openai import APIConnectionError, APIStatusError, OpenAI

from crow_cli.agent.configure import Config

PROBE_IMAGE = Path(__file__).resolve().parent.parent / "assets" / "probe-image.png"
QUESTION = (
    "What color is the background of this image and what animal is shown? "
    "One line."
)

COLOR_WORDS = ("purple", "indigo", "violet", "blue", "navy")
ANIMAL_WORDS = ("crow", "bird", "raven")
REFUSAL_WORDS = (
    "cannot",
    "can't",
    "no image",
    "not able",
    "unable",
    "don't see",
    "do not see",
)


def suggest(text: str | None) -> tuple[str, str]:
    """Heuristic (suggestion only — the agent decides): (modality list as
    string, reason) from the model's raw answer."""
    t = (text or "").strip().lower()
    if not t:
        return "[text]", "empty response (image silently dropped)"
    if any(c in t for c in COLOR_WORDS) and any(a in t for a in ANIMAL_WORDS):
        return "[text, image]", "described the probe image correctly"
    if any(r in t for r in REFUSAL_WORDS):
        return "[text]", "honest refusal (no vision)"
    return "[text]", "hallucinated/wrong answer"


def probe_model(client: OpenAI, model_id: str, image_b64: str) -> tuple[int, str, str]:
    """Return (http status, suggestion, raw answer text)."""
    try:
        resp = client.chat.completions.create(
            model=model_id,
            max_tokens=64,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": QUESTION},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{image_b64}"},
                        },
                    ],
                }
            ],
        )
    except APIStatusError as e:
        # 400/404 = rejected the image block outright. 429/5xx = not a
        # capability signal; the agent should leave it untouched / rerun.
        if e.status_code in (400, 404):
            return e.status_code, "[text]", f"rejected image block: {str(e.message)[:80]}"
        return e.status_code, "?", f"HTTP {e.status_code} — not a capability signal, rerun"
    except APIConnectionError as e:
        return 0, "?", f"connection error: {e} — rerun"
    raw = (resp.choices[0].message.content or "").strip()
    _mods, reason = suggest(raw)
    return 200, _mods, f"{reason} | raw: {raw[:100]}"


def apply_modalities(text: str, updates: dict[str, list[str]]) -> tuple[str, int]:
    """Line surgery: set/insert `modality: [...]` under each model block.
    Never round-trips the YAML, so comments and formatting survive."""
    lines = text.splitlines()
    changed = 0
    for name, mods in updates.items():
        mod = f"[{', '.join(mods)}]"
        key_re = re.compile(rf"^(\s+){re.escape(name)}:\s*(#.*)?$")
        ki = next((i for i, l in enumerate(lines) if key_re.match(l)), None)
        if ki is None:
            print(f"  ! model {name!r} not in config.yaml; skipped", file=sys.stderr)
            continue
        indent = len(lines[ki]) - len(lines[ki].lstrip())
        end = ki + 1
        while end < len(lines) and (
            not lines[end].strip()
            or (len(lines[end]) - len(lines[end].lstrip())) > indent
        ):
            end += 1
        mi = next(
            (i for i in range(ki + 1, end) if re.match(r"^\s+modality:", lines[i])),
            None,
        )
        sib = next(
            (
                i
                for i in range(ki + 1, end)
                if lines[i].strip()
                and not lines[i].strip().startswith("#")
                and (len(lines[i]) - len(lines[i].lstrip())) > indent
            ),
            None,
        )
        field_indent = " " * (
            (len(lines[sib]) - len(lines[sib].lstrip()))
            if sib is not None
            else indent + 2
        )
        if mi is not None:
            if lines[mi].strip() == f"modality: {mod}":
                continue
            lines[mi] = f"{field_indent}modality: {mod}"
        else:
            lines.insert(ki + 1, f"{field_indent}modality: {mod}")
        changed += 1
    return "\n".join(lines) + "\n", changed


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--provider", help="only probe models on this provider")
    ap.add_argument("--config-dir", help="config dir (default: ~/.agents/crow)")
    args = ap.parse_args()

    config = Config.load(Path(args.config_dir) if args.config_dir else None)
    image_b64 = base64.b64encode(PROBE_IMAGE.read_bytes()).decode()

    clients: dict[str, OpenAI] = {}
    rows: list[tuple[str, str, int, str, str]] = []  # name, provider, status, suggestion, raw
    for name, model in config.llm.models.items():
        if args.provider and model.provider_name != args.provider:
            continue
        provider = config.llm.providers.get(model.provider_name)
        if provider is None or not provider.base_url:
            print(f"  ! {name}: no provider/base_url; skipped", file=sys.stderr)
            continue
        if provider.name not in clients:
            if not provider.api_key:
                print(f"  ! provider {provider.name}: no api_key; skipped", file=sys.stderr)
                continue
            clients[provider.name] = OpenAI(
                base_url=provider.base_url, api_key=provider.api_key
            )
        print(f"probing {name} ({model.model_id}) ...", file=sys.stderr)
        status, suggestion, raw = probe_model(clients[provider.name], model.model_id, image_b64)
        rows.append((name, model.provider_name, status, suggestion, raw))

    print(f"\n{'model':24} {'provider':10} {'http':>4} {'suggested':16} raw answer")
    for name, provider, status, suggestion, raw in rows:
        print(f"{name:24} {provider:10} {status:>4} {suggestion:16} {raw}")
    print(
        "\nsuggestion is a heuristic — YOU decide the modality lists "
        "(web-search anything surprising), then apply via apply_modalities; "
        "see SKILL.md."
    )


if __name__ == "__main__":
    main()
