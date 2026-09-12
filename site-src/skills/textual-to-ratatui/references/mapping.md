# Textual → ratatui construct mapping

Construct-by-construct. Left column is what the Python file contains; right column
is the ratatui design that has the same behavior. File pointers are into
`~/src/crow-term/crow-term` unless noted; Python pointers into
`~/src/crow-term/crow-cli/src/crow_cli/tui`.

## Structure

| Textual | ratatui |
|---|---|
| `App.compose()` widget tree | `Layout::vertical([Constraint::Min(..), Constraint::Length(..), ..]).areas(frame.area())`; one render fn per region |
| `Widget`, `containers.*` | plain functions `fn render_x(frame, &state, area)`; `Clear` widget before drawing a popup over existing content |
| `DEFAULT_CSS`, stylesheets | `Style::new().fg(Color::X).add_modifier(Modifier::BOLD)` per span; a palette struct once themes exist |
| `query_one`/`query_ancestor` | direct struct fields — there is no tree to query |
| widget mounting/unmounting (`mount`, `remove`) | a field going `Option<T>::Some/None` and the render fn branching on it |

## State

| Textual | ratatui |
|---|---|
| `var[bool]`, `reactive` | plain field on the state struct |
| `watch_*` side effects | explicit calls at the mutation site in the event loop (no implicit reactivity) |
| `set_timer`/`set_interval` | `tokio::time` branch in the `select!` loop, or an `Instant` field checked each loop pass (see `CancelGesture` in app.rs for the window pattern) |
| `Message` subclasses + `post_message` + `@on(Message.X)` | event enum over an mpsc channel; one `tokio::select!` arm per source (keys, agent updates, turn completions) |
| async workers `@work(thread=True)` | `tokio::spawn` + a completion channel; tag results with a generation counter so stale ones are dropped (`turn_generation`) |
| `prevent_default`/`stop` event propagation | edit ops return `bool` consumed; handler order encodes priority |

## Input

| Textual | ratatui |
|---|---|
| `BINDINGS = [Binding("enter", "submit", priority=True), ...]` | match arms in one key handler, in priority order; `Binding("ctrl+j,shift+enter")` → `KeyCode::Enter` with `SHIFT` + `KeyCode::Char('j')` with `CONTROL` |
| `on_key`/`on_input` | same handler; filter `KeyEventKind::Press` (crossterm sends Press/Release/Repeat) |
| focus-based key routing | explicit ownership order, as a comment at the top of the handler: quit → open popup → modal → cancel gesture → prompt editing → submit → scroll |
| `TextArea`/`Input` | `InputBuffer` (input.rs): caret = byte offset kept on char boundaries, insert/backspace/delete/word-ops returning bool, home/end two-stage, history with draft restore |
| `OptionList` + fuzzy search modal (`SlashComplete`) | pure `candidates(query, sources) -> Vec<Candidate>` + `render_completion() -> Vec<Line>` + popup `Rect` above the input; nav keys owned while open, selection carried across keystrokes |
| `PathComplete`/`PathSearch` (`@file`) | `path_candidates(query, cwd)`: list the queried dir (bounded ~10k entries), keep the typed prefix verbatim in the insert, dirs complete with `/` so Tab walks in, exact file match closes the popup |

## Display

| Textual | ratatui |
|---|---|
| `RichLog`/`Markdown` widget | markdown.rs: pulldown-cmark event writer → styled `Vec<Line>`, streaming-safe (an open code fence renders what arrived), one-entry memo keyed on inputs |
| syntax highlighting | highlight.rs: syntect + two_face (Dracula), ANSI-alpha decode, size guardrails |
| `VerticalScroll`, `window.anchor()`, stick-to-bottom | `Scroll { follow, top }` + pure `viewport(total, height, scroll)` / `rows_below()`; recompute from the BOTTOM on resize |
| wrapped text / `Text.from_markup` | wrap the lines yourself (wrap.rs): word wrap, CJK double-width, combining marks stay with base char, indent preserved, over-wide words split. Row count must equal rows drawn — that invariant is the scrollback |
| cursor in an input (`TextArea` cursor) | `frame.set_cursor_position(Position::new(x, y))` computed from caret byte offset → display width |
| toasts/flash notifications | `flash: Option<String>` field rendered in the status line, cleared on next interaction |
| `rule()` separators | a `Line` of `─` spans |

## Testing

| Textual | ratatui |
|---|---|
| Textual `Pilot` app tests | none needed for render: pure fns + plain state make ordinary `#[test]`s; assert on `Vec<Line>` spans and state math |
| manual clicking around | tmux recipe in SKILL.md; `capture-pane` is the assertion source |
