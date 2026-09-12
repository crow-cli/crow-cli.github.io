---
name: textual-to-ratatui
description: Convert Textual (Python) TUI widgets/screens — crow_cli.tui, toad — into fast Rust ratatui modules, feature by feature. Use when the task is "port this widget", "textual to ratatui", "convert crow_cli.tui to crow-term", "ratatui equivalent of a Textual widget", building a crow-term feature from the Python TUI branch, or when a Textual concept (reactive var, Message pump, BINDINGS, OptionList, TextArea, anchor) needs a ratatui design. Covers the paradigm shift (retained reactive → immediate mode), the state/render/input split that makes ports testable, and the verified ratatui 0.30 / pulldown-cmark API landmines.
---

# Textual → ratatui, feature by feature

The workflow that worked for five consecutive conversions in crow-term
(markdown 13f5ced, scrollback 8b45526, prompt input 1fd7dfe, completion 2fbd03f,
stream accumulation 7c02d73/d4bd20c). The insight: Textual couples state, rendering,
and input inside widgets; ratatui wants them as three separate things. Split them
FIRST, then port each piece — the port becomes mechanical.

## The paradigm shift (read this before touching code)

| Textual | ratatui |
|---|---|
| Retained widget tree, re-rendered on reactive change | Immediate mode: you draw the whole screen every loop iteration, cheaply |
| State lives in widgets (`var`, `reactive`) | State is ONE plain-data struct (`App`) — no I/O, no async, no ratatui types where avoidable |
| Mutation happens inside widget methods, anywhere | ALL mutation happens in the event loop; render only reads |
| Messages + `post_message` + `@on` decouple widgets | Event enums over channels, drained in one `tokio::select!` loop |
| CSS cascade and DEFAULT_CSS | Explicit `Style` per span, no cascade |
| Focus decides who gets keys | An explicit ownership ORDER in the key handler (see step 4) |

Two principles that keep the port fast:
- **Pure render**: render functions take data and return `Vec<Line>` — testable
  without a screen, identical between unit test and live pane.
- **Control plane never waits for render plane**: notifications (cancel!) and
  completions travel their own channels; the render loop consumes them when it
  gets to them, and generation guards drop stale ones. This is why cancellation
  is instant here and wasn't in the Textual TUI.

## The workflow

1. **Read the Python file whole.** Bindings, reactive vars, watchers, messages,
   CSS, render method — a grep hit is not understanding. List what the widget
   holds (state), what it draws (render), what keys it owns (input).
2. **Port state first**, as a plain-data struct with methods that are pure
   operations (edit ops return `bool` = "consumed" so callers can fall through).
   No ratatui imports in the state module beyond text types.
3. **Port render** as a pure function: state in, `Vec<Line<'static>>` out.
   When row counts matter (scrolling), do the wrapping YOURSELF (see
   `crates/tui/src/wrap.rs`) — ratatui's reflow is private and your row count
   must match what you actually draw. Memoize only with the inputs in the key.
4. **Port input** as key routing with an explicit ownership order, written as a
   comment: e.g. ctrl-c quit → open popup owns nav keys → turn-cancel gesture →
   prompt editing → submit → transcript scroll. Preserve Textual's exact key
   combos (`Binding("ctrl+j,shift+enter", ...)`) — they are product decisions,
   not implementation details.
5. **Unit-test the pure parts**: state math (viewport, caret positions, candidate
   ranking) and render output (does the popup mark the selected row). When a
   test fails, trace byte-by-byte BEFORE changing expectations — twice already
   the implementation was right and the test's assumptions were wrong.
6. **Live check** under tmux (below), then gate: `cargo clippy --all-targets`
   zero warnings (pedantic), `cargo test` green, commit with Session-Id trailer.

## Canonical examples (crow-term, one per pattern)

| Textual source | ratatui result |
|---|---|
| `widgets/prompt.py` TextArea + bindings | `crates/tui/src/input.rs` — InputBuffer, caret as byte offset on char boundaries |
| `widgets/slash_complete.py` fuzzy OptionList modal | `crates/tui/src/completion.rs` — pure candidate fns + popup render + nav ownership |
| conversation scroll anchoring (`window.anchor`) | `crates/tui/src/app.rs` `Scroll` + pure `viewport()`/`rows_below()` + `crates/tui/src/wrap.rs` |
| Markdown/RichLog + syntax highlight | `crates/tui/src/markdown.rs` + `highlight.rs` — streaming-safe event writer, memo cache |
| `conversation.py` stream accumulation | `crates/tui/src/app.rs` blocks + `Kind`, upsert-by-id tool calls |

## Live check recipe (tmux)

```bash
tmux kill-session -t crowinput 2>/dev/null
tmux new-session -d -s crowinput -x 80 -y 24 \
  "$PWD/target/debug/crow-term --cwd /tmp/crowterm-scratch"
sleep 8                      # agent connect + initialize
tmux send-keys -t crowinput "text"
tmux capture-pane -p -t crowinput | rg -n . | tail -8
tmux display-message -p -t crowinput 'cursor: #{cursor_x},#{cursor_y}'
```

- Empty cwd (the agent's system prompt embeds the file tree); generous sleeps
  (a slow local model is not a hung turn); `--cancel-after` on the probe binary
  instead of signals.
- `tmux send-keys Esc` types the literal string "Esc" — the key name is `Escape`.

## References

- `references/mapping.md` — the full construct-by-construct mapping table.
- `references/gotchas.md` — verified API landmines (ratatui 0.30, pulldown-cmark
  0.13, syntect/two-face, crossterm) with the exact workaround for each.
