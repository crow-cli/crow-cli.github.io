---
name: searxng
description: Recover the local searxng instance that backs the web_search tool.
  Use when web_search returns empty results, errors out, or you suspect the
  search backend is down ("search engine down", "web search not working",
  "searxng", "no results found" on a query that should have hits). Web search
  is NOT optional equipment — if it is broken, fix it before continuing, don't
  silently fall back to guessing. Diagnose, restart the container, retry.
---

# searxng — web search backend recovery

The `web_search` tool is served by a local [searxng](https://github.com/searxng/searxng)
instance running in Docker, defined in `~/.agents/crow/compose.yaml` (service
`searxng`, image `searxng/searxng`, container name `crow-searxng-1`). It listens
on `${SEARXNG_PORT}` (mapped to 8080 in the container).

## When this applies

`web_search` returning **empty results** or erroring on a query that obviously
should have hits almost always means the searxng container is down or wedged —
NOT that the topic is unsearchable. Do not conclude "no information exists"
from an empty `web_search`; treat it as a backend fault and check.

## Diagnose

```bash
docker ps --format '{{.Names}}\t{{.Status}}' | grep searxng   # is it up?
curl -s "http://localhost:${SEARXNG_PORT:-2946}/healthz" || echo "DOWN"
```

If the container is missing, restarting, or the health check fails → recover.

## Recover

```bash
cd ~/.agents/crow && docker compose down -v && docker compose pull && docker compose up -d
```

Then **retry the search**. `down -v` drops the named volume, `pull` grabs a
fresh image, `up -d` restarts detached. Give it a few seconds to boot before
retrying.

## Notes

- Compose project name is `crow` (containers are prefixed `crow-`).
- `SEARXNG_PORT` comes from the environment / `~/.agents/crow/.env`; default seen in
  the wild is `2946`.
- Config is mounted from `~/.agents/crow/searxng/` into `/etc/searxng`.
- This restart is cheap and safe — it is the first thing to try, not the last.
