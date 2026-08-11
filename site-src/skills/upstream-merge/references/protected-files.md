# Protected crow files (merge manifest)

Paths the upstream-merge gate must protect. Grouped by category. This is the
source of truth for "what is crow stuff." Update as the fork evolves.

Repo-relative to the zed fork root.

## Category A — net-new crow files (NEVER delete; presence-tested)
  - crates/agent_ui/src/workspace_agent_threads.rs
  - crates/agent_ui/src/agent_thread_item.rs
  - crates/client/src/atproto_auth.rs
  - mock_pds.py
  - script/install-crow
  - script/upstream-watch
  - TODO.md

## Category B — rewired shared files (characterization-tested; upstream edits often)
  - crates/agent_ui/src/agent_panel.rs
  - crates/agent_ui/src/agent_ui.rs
  - crates/client/src/client.rs
  - crates/client/src/user.rs
  - crates/client/src/zed_urls.rs
  - crates/client/Cargo.toml
  - crates/http_client/src/http_client.rs
  - crates/collab/src/lib.rs
  - crates/collab_ui/src/collab_panel.rs
  - crates/settings_content/src/settings_content.rs
  - crates/acp_thread/src/acp_thread.rs   # read_text_file/write_text_file: out-of-worktree Fs fallback (crow)

## Category C — cosmetic rebrand (high-frequency conflict; see whitelist below)
String "Zed" -> "Crow" in USER-FACING display text. Hot spots:
  - crates/release_channel/src/lib.rs        # display_name must stay "Crow" (THE hard guard)
  - crates/zed/src/zed.rs
  - crates/zed/src/main.rs
  - crates/zed/src/zed/app_menus.rs
  - crates/cli/src/main.rs
  - crates/terminal/src/terminal.rs
  - crates/editor/src/hover_links.rs
  - crates/extensions_ui/src/extensions_ui.rs
  - crates/title_bar/src/title_bar.rs
Binary icons (can't grep — protect by checksum / re-assert after merge):
  - crates/zed/resources/app-icon*.png
NOTE: assets/settings/default.json is a TRAP — most of its "Zed" strings are
comments or enum tokens that must stay (see whitelist). Do not bulk-rebrand it.

## Category D — feature additions (localized tests)
  - typst preview (added in commits 0fc50993b0 / 7e678d1b05; locate exact crate
    before encoding a guard)

## Gate scan snippets

### Crown-jewel presence (HARD guard — want: no output)
    for f in crates/agent_ui/src/workspace_agent_threads.rs crates/agent_ui/src/agent_thread_item.rs crates/client/src/atproto_auth.rs mock_pds.py; do test -f "$f" || echo "MISSING: $f"; done

### Rebrand integrity — wide grep is TRIAGE ONLY, not a hard gate
    git grep -nI -E '\bZed\b|zed\.dev' -- crates/release_channel crates/zed/src crates/cli/src assets/settings/default.json
This is NOISY by design: it flags legitimate "Zed" enum tokens. Use it to spot
*new* leaks a merge introduced (diff the grep output before/after), not as a
pass/fail gate.

### WHITELIST — "Zed" occurrences that are CORRECT (rebranding these BREAKS the app)
  - assets/settings/default.json: "base_keymap": "Zed"        # BaseKeymap enum token
  - assets/settings/default.json: "icon_theme": "Zed (Default)"  # icon-theme id
  - comments in default.json ("...quitting Zed", etc.)        # cosmetic, leave alone
A mindless find-replace of Zed->Crow will hit these and break settings parsing.
This is the single best argument for intelligent (not blind) merging.

### The HARD rebrand guard is narrow + semantic (characterization tests, not grep)
  - release_channel display_name == "Crow"   (what shows in title bar / About)
  - no zed.dev cloud URL in crates/client/src/client.rs
