# Verified API landmines (ratatui 0.30 stack)

Each of these cost real debugging time. Versions are the ones in crow-term's
Cargo.lock: ratatui 0.30 over ratatui-core 0.1.2 / ratatui-widgets 0.3.2,
pulldown-cmark 0.13, syntect 5, two-face 0.5 (`syntect-default-onig`),
unicode-width 0.2, crossterm (via ratatui), edition 2024.

## ratatui 0.30

- `Style` has NO `|=` with `Modifier` — use `.add_modifier(Modifier::X)`.
- `Style::new()` takes ZERO args — `Style::from(color)` or builder methods.
- `Text` has no `ruled_lines` / `height(width)` — wrap yourself.
- **reflow.rs (WordWrapper) is private** — that's why wrap.rs exists. If a row
  count must match what is drawn, you own the wrapping. No exception found.
- `Paragraph::new` takes `Vec<Line>`/slice, NOT an iterator.
- `Frame::set_cursor_position(Position::new(x, y))` — position is u16; clamp.
- `Layout::vertical([Constraint::Min(3), Constraint::Length(n)]).areas(area)`
  returns an array of `Rect` — destructure with `let [a, b, c] = ...`.
- The crate is split (ratatui-core / ratatui-widgets / -crossterm) — imports
  come from odd places; check crow-term's main.rs import block before guessing.
- `Line::width()` exists and is the display width (useful for popup sizing).

## pulldown-cmark 0.13

- NO cargo features for tables/strikethrough/tasklists — they are runtime
  `Options` flags; build with `default-features = false` and set Options.
- **Table header cells arrive directly inside `TagEnd::TableHead` with NO
  `TableRow`** — finalize the header row on TableHead end, not on a row end.
  A unit test caught this; don't relearn it from the rendered output.
- `TagEnd::BlockQuote(_)` takes a payload — match `TagEnd::BlockQuote(_)`.
- `Event::TaskListMarker(bool)` is an Event, not a Tag.
- Inline code is `Event::Code(CowStr)`.

## crossterm

- Filter `key.kind == KeyEventKind::Press` or every key fires twice/thrice.
- Async keys: `crossterm::event::EventStream` + `StreamExt` in the select loop.
- Bracketed paste arrives as `Event::Paste(String)` — insert at the caret.

## Rust edition 2024

- let-chains (`if let Some(x) = a && cond`) work — use them instead of nesting.

## tmux (the live-check harness)

- `tmux send-keys Esc` types the LITERAL STRING "Esc" — the key name is `Escape`.
- `-x 80 -y 24` on `new-session` sizes the pane deterministically.
- `capture-pane -p` + `rg -n .` gives numbered rows; `display-message -p
  'cursor: #{cursor_x},#{cursor_y}'` verifies caret placement exactly.
- Empty cwd for agent runs (the system prompt embeds the file tree); sleeps of
  2–5 min are normal on a slow local model — slow is not hung.
- Never drive cancellation with signals — use a `--cancel-after` flag on the
  probe binary.

## Discipline

- When a unit test fails, trace byte-by-byte BEFORE changing code or
  expectations. Twice the implementation was right and the test's mental model
  was wrong (multibyte backspace, mid-string caret insert).
- `rg -r` is `--replace`: `rg -rn "foo"` silently replaces every match with
  "n" and prints mangled output. Line numbers are `-n`, counts are `-c`.
