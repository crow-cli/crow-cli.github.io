---
name: model-probe
description: "Probe provider models with a real image to find out which are truly
  vision-capable, print the raw evidence, and (after YOU judge the results)
  write per-model modality lists into ~/.agents/crow/config.yaml. Use when the
  user says 'probe the models', 'which models have vision', 'fill out model
  capabilities', 'mark the text-only models', 'update modalities', 'vision
  capable', or after adding new models to config.yaml. Crow assumes [text,
  image] by default ('let it fail'); this skill produces the evidence and you
  fill in the optional values."
---

# model-probe

## Why content-judging

- `/v1/models` exposes no capability metadata on OpenAI-compatible gateways.
- Status codes LIE (all observed live against DashScope):
  - text-only gateways silently DROP image blocks → 200 with an honest
    refusal ("no image was provided"), EMPTY content, or a confident
    hallucination ("white background, meerkat");
  - vision models can 400 a malformed probe image (1x1 px) while being fully
    vision-capable.
- So the script sends the bundled `assets/probe-image.png` (ground truth:
  indigo/purple field, white "crow" wordmark, white crow/bird silhouette) and
  records the model's RAW answer.

## 1. Run the probe (evidence only — it decides nothing)

```bash
uv --project ~/.agents/skills/model-probe run python ~/.agents/skills/model-probe/scripts/probe_models.py
uv --project ~/.agents/skills/model-probe run python ~/.agents/skills/model-probe/scripts/probe_models.py --provider alibaba
```

The skill's pyproject pins `crow-cli>=0.1.33`, so `Config.load` reads the same
`~/.agents/crow/config.yaml` + `.env` the agent uses — no environment hunting.
Each probe is one tiny request per model (max_tokens 64). Output columns:
model, provider, http status, heuristic suggestion, raw answer.

## 2. YOU judge the modalities

The `suggested` column is a dumb heuristic (correct description →
`[text, image]`; refusal/empty/hallucination/400 → `[text]`). Treat it as a
first draft and sanity-check it:

- "hmm, this doesn't seem right" → `web_search` the model's spec before
  applying (e.g. "deepseek-v3.2 vision", "qwen3.8-max video understanding").
  Providers document modality support even when the API doesn't.
- HTTP 429/5xx/connection errors (`?` suggestion) are NOT capability signals —
  leave those models untouched or rerun.
- Image-GEN models (qwen-image-*, wan*) 400 on chat completions → `[text]` is
  correct: they must never receive routed images.
- Add `video`/`audio` by hand for models known to take them natively
  (e.g. qwen3.x-max: `[text, image, video]`) — the probe only tests images.

## 3. Apply your verdicts with the skill's venv

`apply_modalities()` is line surgery: comments and formatting in config.yaml
survive, reruns are idempotent. Feed it YOUR decided lists, not the raw
suggestion column:

```bash
uv --project ~/.agents/skills/model-probe run python - <<'EOF'
import sys
from pathlib import Path
sys.path.insert(0, str(Path.home() / ".agents/skills/model-probe/scripts"))
from probe_models import apply_modalities

updates = {
    "qwen3.8-max-preview": ["text", "image", "video"],
    "deepseek-v3.2": ["text"],
    # ... one entry per model you probed and judged
}
p = Path.home() / ".agents/crow/config.yaml"
new, changed = apply_modalities(p.read_text(), updates)
p.write_text(new)
print(f"changed {changed} models")
EOF
```

Verify with `crow-cli models` (modality + sampling columns).

## What the values mean

`modality` is a list of `text | image | audio | video` (per-model, in
config.yaml). Default `[text, image]` = assume vision-capable until proven
otherwise. `[text]` changes routing: image blocks get stripped / routed to a
same-provider `fallbacks:` entry instead of hard-failing. `temperature` /
`reasoning_effort` stay human choices — never write them from this skill.
