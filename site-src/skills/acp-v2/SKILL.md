---
name: acp-v2
description: Build against Agent Client Protocol v2 (the in-draft successor to the
  v1 JSON-RPC stdio protocol crow-cli currently speaks). Use when the task is "build
  an ACP v2 agent/client", "Rust ACP agent", "crow-cli v2", "persistent agent",
  "session/update stream", "state_update / move beyond the turn", orchestration /
  subagent verifier over ACP, or migrating the existing v1 crow-cli ACP code to v2.
  Covers what v2 changes vs v1, the exact repo/crate map (the non-obvious bit), the
  verified Rust wire types, the new prompt lifecycle that enables event-driven
  orchestration, and how to scaffold crow-cli v2 as a PERSISTENT Rust ACP AGENT (with
  MCP tools + native lancedb), plus the client/conductor side for orchestration.
  Source = the cloned spec repo ~/src/crow-team/agent-client-protocol and the cloned
  runtime ~/src/crow-team/rust-sdk (schema v2.0.0-alpha.2, draft 2026-07-20).
---

# ACP v2 — reference for building crow-cli v2 (a persistent Rust ACP agent)

> **Status: DRAFT.** v2 schema published for review 2026-07-20 (`2.0.0-alphaX`).
> Gate every v2 code path behind **version negotiation AND a cargo feature**; do not
> ship v2 by default until stabilization; **do not drop v1** (v1-only peers stay
> common). Per connection you speak exactly one negotiated version after `initialize`.
>
> **Who is who (don't get this backwards):** crow-ade (the IDE) is the ACP **Client**;
> crow-cli (the AI) is the ACP **Agent**. So **crow-cli v2 = a Rust ACP *agent*** — it
> implements the `ClientRequest` handlers and *emits* `session/update`. The client side
> matters for the orchestrator/verifier and for thin automation CLIs. Both sides are
> covered below; the agent side (§6) is the primary one for us.
>
> **Everything below was read from the two cloned repos, not recalled** — file:line and
> paths are given so you can re-verify in one grep. The live repos outrank this file.
> Where something is inference rather than a direct read, it says so.
>
> **Live hosted docs index:** `https://agentclientprotocol.com/llms.txt` — the official
> llms.txt index of all hosted ACP docs (v1 + v2 protocol pages and every RFD, e.g.
> `protocol/v2/migration.md`, `protocol/v2/prompt-lifecycle.md`, `rfds/v2/diff-file-states.md`,
> `rfds/streamable-http-websocket-transport.md`, `rfds/proxy-chains.md`). Fetch it to
> discover/verify a doc that the cloned repos don't cover yet; the hosted docs outrank this file.

## 0. The repo / crate map (READ THIS — it is the thing that wastes an hour)

Two repos, **both cloned locally**. The Rust "schema" crate is wire types only; the
runtime is a separate repo. Inventing crates that don't exist is the #1 time sink.

| Thing | Where | What it is |
|---|---|---|
| **Spec repo** (cloned) | `~/src/crow-team/agent-client-protocol` | The protocol: docs, RFDs, JSON schemas, and the **wire-type** Rust crate. |
| `agent-client-protocol-schema` (spec repo root crate) | `…/agent-client-protocol-schema/src/{v1,v2}/*.rs` | **Hand-written** strongly-typed wire types (request/response/notification + serde + JSON-Schema gen). `v2` module = the v2 types. **Types only — no transport, no runtime.** |
| `schema/v2/` crate | `…/schema/v2/src/lib.rs` | **3-line version marker** for the JSON-schema prerelease. NOT the types. sg/rg finds nothing here. |
| `schema/v2/schema.json` | `…/schema/v2/schema.json` | **Machine-readable source of truth** (cross-language). `schema.unstable.json` layers opt-in draft features. |
| **rust-sdk repo** (cloned) | `~/src/crow-team/rust-sdk` | **The runtime.** Workspace members below. mdbook: `agentclientprotocol.github.io/rust-sdk`. |
| python-sdk (installed) | `acp==0.9.0` in the crow-cli venv | What **current crow-cli v1** uses. v1-only for our purposes. |

**rust-sdk workspace members** (`~/src/crow-team/rust-sdk/Cargo.toml`):

- `agent-client-protocol` — **core**: the `Client`/`Agent` role-marker types, the
  `V2Builder`, JSON-RPC machinery (`src/jsonrpc.rs`), the subprocess transport
  (`src/acp_agent.rs` = `AcpAgent`/`Acpn`), and the v2 session API (`src/session/v2.rs`).
  **Carries the `unstable_protocol_v2` cargo feature.**
- `agent-client-protocol-test` — the `Testy` fixture: **`src/testy/v2.rs` is a complete
  worked v2 *agent*** (the template for crow-cli v2), and `tests/testy_v2.rs` is a worked
  v2 *client*. These two files are your ground truth.
- `agent-client-protocol-http` — **persistent-server transport**: `AcpHttpServer` /
  `ServerOptions` / `CorsOptions` + a websocket server (`server` feature); `HttpClient`
  (`client` feature). This is how a long-lived agent is reached over HTTP/WS.
- `agent-client-protocol-conductor` — **proxy-chain orchestrator**:
  `Editor ← stdio → Conductor → Proxy 1 → … → Agent`. Spawns the chain as subprocesses,
  routes messages, presents as a single agent. The multi-agent composition primitive.
- `agent-client-protocol-rmcp` — **MCP bridge** (the v2 home for tools, §12).
- `-derive` (macros), `-polyfill`, `-trace-viewer`, `-cookbook`.
- `yopo` (`agent-client-protocol-yopo`) — a full **client** binary (JSON config/env;
  `parse_agent_args` builds an `AcpAgent`). Reference for client-side agent-spawn config.

> ⚠️ **There is NO `agent-client-protocol-tokio` crate.** Earlier notes/search snippets
> named it; it does not exist. Transport + spawn live in the **core** crate.
>
> ⚠️ **At HEAD the core crate pins `agent-client-protocol-schema = "=1.6.0"` — the v1
> schema.** The shipped example (`examples/yolo_one_shot_client.rs`) is **v1**. v2 is
> in-flight behind `unstable_protocol_v2`; the worked v2 references are the two Testy
> files above, not any `examples/`.
>
> **A Rust v2 build depends on:** `agent-client-protocol` (runtime, feature
> `unstable_protocol_v2`) + `agent-client-protocol-schema` (wire types, same feature) +
> the transport crate you need (`-http` for a persistent server). Use
> `path = "../rust-sdk/src/agent-client-protocol"` while iterating against the clone.

## 1. v2 in one screen (the five things to remember)

From `docs/protocol/v2/migration.mdx`:

1. **`session/prompt` no longer ends the turn.** Its response = "prompt accepted"
   (often `{}`). Foreground progress + completion + stop reason arrive as
   `session/update` → `state_update`. → *the agent drives the turn by emitting updates;
   the client drives its loop off the update stream, not the prompt response.*
2. **Updates are upserts by ID.** Messages / tool calls / plans are patched by
   `messageId` / `toolCallId` / `planId`: omitted field = unchanged, `null` = cleared,
   value = replaced, **chunks append**.
3. **Client fs + client terminal execution + session modes are GONE.** Agent-owned
   terminal output is a separate *display-only* v2 surface; for tools the agent uses
   **MCP servers** (this is why "MCP as the protocol for Rust tools" is the v2-native
   design, §12).
4. **Capabilities reorganized.** One `capabilities` + **required** `info` on both sides;
   session-scoped groups nested under `session`; **object** support markers (`{}` =
   supported, absent/`null` = unsupported) instead of booleans; a **required baseline**
   of session methods.
5. **Everything is extensible.** Enums / tagged unions accept unknown values;
   `_`-prefixed = yours, other unknowns = future ACP. **Never fail on an unknown
   variant** (Rust types are `#[non_exhaustive]` with an untagged `Other` arm — always
   keep a wildcard match arm).

## 2. Method surface (v1 → v2)

Verified method literals in `schema/v2/schema.json`: `initialize`, `auth/login`,
`auth/logout`, `session/new`, `session/list`, `session/delete`, `session/resume`,
`session/close`, `session/set_config_option`, `session/prompt`, `session/update`,
`session/request_permission`, `session/cancel`, plus `$/cancel_request`.

| v1 | v2 |
|---|---|
| `authenticate` | `auth/login` |
| `logout` (capability-gated) | `auth/logout` (required iff `authMethods` non-empty) |
| `session/load` | **removed** → `session/resume` + `"replayFrom": {"type":"start"}` |
| `session/set_mode` | **removed** → `session/set_config_option` |
| `fs/*`, `terminal/*` (client-owned) | **removed** (→ MCP tools + agent-owned terminal display) |
| `session/list` / `session/resume` / `session/close` | now **required baseline** when `session` present |
| `session/prompt` | same shape, **response semantics redesigned** (§4) |

Baseline required when `capabilities.session` is advertised: `session/new`,
`session/list`, `session/resume`, `session/close`, `session/prompt`, `session/cancel`,
`session/update`. Optional extras keep markers: `session.delete`,
`session.additionalDirectories`, `session.prompt`, `session.mcp`.

## 3. `session/update` variants (v1 → v2)

Rust enum `SessionUpdate` @ `agent-client-protocol-schema/src/v2/client.rs:99`
(wire tag = snake_case of the PascalCase variant):

`UserMessageChunk(ContentChunk)`, `UserMessage(UserMessage)`,
`AgentMessageChunk(ContentChunk)`, `AgentMessage(AgentMessage)`,
`AgentThoughtChunk(ContentChunk)`, `AgentThought(AgentThought)`,
`StateUpdate(StateUpdate)`, `ToolCallContentChunk(ToolCallContentChunk)`,
`ToolCallUpdate(ToolCallUpdate)`, + plan / terminal / terminal-output-chunk /
config-option / session-info / usage / available-commands updates (**read `client.rs:99`
for the exact current tail**; `schema/v2/schema.json` cross-checks it).

Key deltas: `user_message` / `agent_message` / `agent_thought` **whole-message upserts**
are NEW (alongside the `*_chunk` streams); `messageId` is now **required** on chunks;
`state_update` is NEW (§4); `tool_call` (v1 create) is **removed** — the first
`tool_call_update` for a `toolCallId` *creates* it; `tool_call_content_chunk` NEW;
`terminal_update` + `terminal_output_chunk` NEW (agent-owned display terminals);
`plan` → `plan_update`; `current_mode_update` **removed**.

## 4. The prompt lifecycle = the orchestration enabler

Source: `docs/rfds/v2/prompt.mdx` + `docs/protocol/v2/prompt-lifecycle.mdx`, and the
agent-side emission order verified in `testy/v2.rs::process_prompt_inner`.

**Agent-side emission order for one turn** (exactly what crow-cli v2 must do):
1. On `PromptRequest`: emit `SessionUpdate::UserMessage` (with an **agent-owned**
   `messageId`) so every observer sees where the prompt landed; record it in history.
2. Emit `StateUpdate::Running(RunningStateUpdate::new())`.
3. Do the work, emitting `AgentMessageChunk` / `AgentThoughtChunk` / `ToolCallUpdate` /
   `ToolCallContentChunk` / `PlanUpdate` / `TerminalUpdate` as you go (record the
   whole-message upserts in history for replay).
4. Emit `StateUpdate::Idle(IdleStateUpdate::new().stop_reason(reason))`.
   `StopReason` variants seen: `EndTurn`, `Cancelled`, `Refusal`.
5. **Then** respond to the `PromptRequest` with `PromptResponse::new()` — the ack. The
   real output already went out as updates.

- `session/update` notifications may flow **at any time**, not just inside a turn. The
  agent may **initiate** interaction before/after a user prompt (background tasks,
  subagents). `Idle` = ready for a new prompt **while background work may continue**.

**What this unlocks for crow:**
- *The react loop triggers on more than `session/prompt`.* The client's event loop is the
  **`session/update` stream**; the prompt response is just the ack.
- *Subagent verifier / judge that wakes and checks the worker.* Two v2-native shapes:
  (a) **multi-client observe** — the verifier attaches to the same `sessionId` and reads
  the same update stream; (b) **judge session** — triggered by `state_update=Idle` on the
  worker, reads the worker via `session/resume` replay, emits a verdict. Either is "wake
  on event, not on prompt," which v1 couldn't express. The **conductor** crate is the
  ready-made proxy-chain composition for this.
- *Queueing / steering*: a queued prompt can be edited/cancelled before acceptance
  because acceptance is now a distinct event.

## 5. The Rust runtime: shared mechanics (`~/src/crow-team/rust-sdk`)

Read first: `md/protocol-v2.md` (THE usage doc) → `src/agent-client-protocol-test/src/testy/v2.rs`
(worked agent) → `src/agent-client-protocol-test/tests/testy_v2.rs` (worked client) →
`src/agent-client-protocol/src/acp_agent.rs` (transport) → `md/migration_v2.0.md`.

### `Client` / `Agent` are role-marker TYPES, not traits
You don't `impl` a trait. You get a builder from the role marker — `Agent.v2()`
(`role/acp.rs:345`) or `Client.v2()` (`:86`) — register callbacks fluently, then connect.
Both return the **same** `V2Builder<Role, …>`, role-parameterized. `.v2()` is v2-only;
`.protocol_router()` (agent) / `.protocol_connector()` (client) are dual-stack.

### Handler arity (verified — this bit is subtle)
Handlers are closures tagged with a macro. The **connection is an optional trailing arg**:
- request handler: `async |req, responder: Responder<Resp>| {…}` **or**
  `async |req, responder, connection: V2ConnectionTo<Counterpart>| {…}`
- notification handler: `async |notif| {…}` **or** `async |notif, connection| {…}`

```rust
.on_receive_request(
    async |request: v2::InitializeRequest,
           responder: Responder<v2::InitializeResponse>,
           _connection: V2ConnectionTo<Client>| {           // 3-arg form (agent side)
        responder.respond(initialize_response(request.protocol_version))
    },
    agent_client_protocol::on_receive_request!(),            // macro tag, required
)
```
`Responder` methods (verified): `.respond(value)`, `.respond_with_error(err)`. **Do not
block a handler closure on slow work** — it blocks ALL dispatch; `connection.spawn(async
move {…})` to do async work tied to the connection, and resolve the `Responder` from there.

### Connection type-state + transport
- `ConnectTo<R>` — a transport you can connect to. **An agent implements
  `ConnectTo<Client>`** (so clients can connect to it); a client passes an
  `impl ConnectTo<Client>` (e.g. `AcpAgent`) to `connect_with`.
- `ConnectionTo<Agent>` / `V2ConnectionTo<Agent>` — client's handle;
  `V2ConnectionTo<Client>` — agent's handle (what agent handlers receive).
- `connect_with<R>(self, transport: impl ConnectTo<Client>, main_fn: impl AsyncFnOnce(ConnectionTo<…>) -> Result<R>) -> Result<R>`
  (`role/acp.rs:112`). The connection is handed INTO `main_fn`; `connect_with` returns
  whatever `main_fn` returns.
- **Subprocess transport (client spawning an agent):** `AcpAgent` (`src/acp_agent.rs`).
  `impl FromStr` — `"python agent.py --flag".parse()?` (plain command) **or** a JSON
  config object (it parses JSON if the trimmed string starts with `{`). Or
  `AcpAgent::new(AcpAgentConfig::new("python"))`; `AcpAgentConfig` has
  `.command`/`.args`/`.env`. (`Acpn` is the multi-arg variant; `yopo` builds these.)

### Strict version negotiation (the SDK never converts v1↔v2)
- A **v2 agent requires a v2 client** and vice versa; a mismatched peer → **error**, the
  caller falls back by building the other version itself. `Agent.v2()`/`Client.v2()` are v2-only.
- **Dual-stack:** agent `Agent.protocol_router().with_v1(a1).with_v2(a2)`; client
  `Client.protocol_connector().with_v1(|| c1()).with_v2(|| c2())` (the connector may
  reopen the transport on fallback; reuses the connection only if normalized initialize
  params match exactly). `Testy::new().protocol_router()` is the worked example.

### Init types
```rust
v2::Implementation::new("crow-cli", env!("CARGO_PKG_VERSION"))   // required role-agnostic `info`
// agent: v2::InitializeResponse::new(protocol_version, info).capabilities(AgentCapabilities::new().session(SessionCapabilities::new()))
// client sends: v2::InitializeRequest::new(ProtocolVersion::V2, info)
```

### Hard rules (from `md/protocol-v2.md` — obey or silently lose events)
- **Client: install handlers BEFORE `session/new`/`session/resume`** — replay updates
  precede the resume response on the wire.
- **Unhandled v2 notifications are DROPPED; unhandled v2 requests get method-not-found.**
  No per-session buffering. Fan updates out with your own policy (an mpsc — exactly Testy).
- **`session/update` events carry `sessionId` + entity IDs but NO prompt/turn ID.** No
  prompt attribution; `state_update` is session-wide.
- **`idle` is not a wire boundary** (background updates may continue while idle).
- **One foreground prompt per session**: the agent must reject a new `session/prompt`
  while `foreground_work` is active (Testy errors "already has foreground work").
- **Cancel:** client `cancel_active_work` → session-wide `session/cancel`; the agent
  completes it after the required `idle` with `stop_reason: cancelled`; client immediately
  marks unfinished tool calls cancelled and resolves pending permissions accordingly.

## 6. Building the AGENT — crow-cli v2's role (template: `testy/v2.rs`)

The worked v2 agent is `V2Testy` (`src/agent-client-protocol-test/src/testy/v2.rs`,
555 lines). Its shape, verified:

```rust
#[derive(Clone, Debug)]
pub struct CrowAgent { state: Arc<Mutex<State>>, state_changed: Arc<Notify> }

// Per-session state the agent owns (this IS the "persistent" part):
struct SessionData {
    cwd: v2::AbsolutePath,
    additional_directories: Vec<v2::AbsolutePath>,
    active: bool,            // false after session/close
    foreground_work: bool,   // a turn is in flight (enforce ONE per session)
    cancelled: bool,
    history: Vec<v2::SessionUpdate>,   // for session/resume replay
}

impl ConnectTo<Client> for CrowAgent {           // <-- makes it connectable
    async fn connect_to(self, client: impl ConnectTo<Agent>) -> Result<(), Error> {
        Agent.v2().name("crow-cli")
            .on_receive_request(async |req: v2::InitializeRequest, res, _cx| {
                res.respond(initialize_response(req.protocol_version))
            }, agent_client_protocol::on_receive_request!())
            .on_receive_request(/* NewSessionRequest   -> create_session, res.respond(NewSessionResponse::new(id)) */)
            .on_receive_request(/* ListSessionsRequest  -> res.respond(ListSessionsResponse::new(infos)) */)
            .on_receive_request(/* ResumeSessionRequest -> send each history update FIRST, then res.respond(ResumeSessionResponse::new()) */)
            .on_receive_request(/* CloseSessionRequest  -> mark inactive; if foreground_work, connection.spawn(wait-then-respond) */)
            .on_receive_request(/* PromptRequest        -> res.respond(PromptResponse::new()) ack, then connection.spawn(process_prompt) */)
            .on_receive_request(/* CancelSessionNotification -> set cancelled, notify state_changed */)
            .connect_with(client, async |_cx| Ok(())).await
    }
}
```

Key agent duties (all visible in `testy/v2.rs`):
- **Own session state** in an `Arc<Mutex<…>>` + a `tokio::sync::Notify` (`state_changed`)
  to wake waiters (e.g. `wait_for_cancelled`, `wait_for_foreground_work`).
- **Emit updates** via a `send_update(connection, &session_id, update)` helper that sends
  a `v2::UpdateSessionNotification` (carries `session_id` + a `SessionUpdate`) — see the
  helper at the bottom of `testy/v2.rs`. **Record whole-message upserts in `history`**
  (`record_history`) so `session/resume` can replay them.
- **Resume replay ordering:** send every replayed update **before**
  `responder.respond(ResumeSessionResponse::new())`.
- **IDs are agent-owned:** `SessionId::new(format!(…))`, `MessageId::new(format!(…))`.
- **Capabilities:** advertise `AgentCapabilities::new().session(SessionCapabilities::new())`;
  add `.mcp(...)` when you expose MCP tools.

**This is the skeleton of crow-cli v2.** The react loop / model call lives inside
`process_prompt`; the tool executors move to MCP (§12).

## 7. Building the CLIENT — orchestrator / verifier / REPL (template: `testy_v2.rs`)

The worked v2 client is `tests/testy_v2.rs`. Use it for the orchestrator/judge and for a
thin automation CLI that drives the persistent agent.

```rust
let (update_tx, mut update_rx) = unbounded_channel::<v2::UpdateSessionNotification>();
Client.v2()
    .on_receive_notification(async move |update: v2::UpdateSessionNotification, _cx: V2ConnectionTo<Agent>| {
        update_tx.send(update).map_err(Error::into_internal_error)
    }, agent_client_protocol::on_receive_notification!())
    .on_receive_request(/* RequestPermissionRequest -> hand Responder to a permission task */)
    .connect_with(agent_transport, async move |connection| {
        connection.send_request(v2::InitializeRequest::new(ProtocolVersion::V2, info)).block_task().await?;
        let (session, _new) = connection.build_session(cwd).start_session().block_task().await?.into_parts();
        session.send_prompt(prompt).on_receiving_result(async move |r| { assert_eq!(r?, v2::PromptResponse::new()); Ok(()) })?;
        // …drain update_rx, run the StateUpdate state machine until Idle…
        Ok(())
    }).await?;
```
Client session API (`src/session/v2.rs`): `build_session(cwd)` / `build_session_cwd()?` →
`V2SessionBuilder`; `.start_session().block_task().await?.into_parts()` →
`(V2Session, NewSessionResponse)`; `session.send_prompt(p) -> SentRequest<PromptResponse>`
(the **ack**; `.on_receiving_result(handler)` or `.block_task().await`); `V2Session`
methods take `&self` (cloneable command handle, does **NOT** buffer inbound messages);
`session.session_id()`, `session.cancel_active_work()?`, `session.close()`;
`connection.resume_session(id, cwd)` / `resume_session_from(resume.replay_from(ReplayFrom::from(ReplayFromStart::new())))`;
`connection.set_config_option(id, Some(cfg))`; low-level `connection.send_request(v2::XxxRequest::new(..))`.

## 8. Wire routing enums (which side handles what)

Verified in `agent-client-protocol-schema/src/v2/`:
- **`ClientRequest`** (`agent.rs:5008`) — the **agent** handles these (client sends):
  `InitializeRequest`, `LoginAuthRequest`, `LogoutAuthRequest`, `NewSessionRequest`,
  `ListSessionsRequest`, `ResumeSessionRequest`, `CloseSessionRequest`,
  `DeleteSessionRequest`, `PromptRequest`, `SetSessionConfigOptionRequest`, …
- **`ClientNotification`** (`agent.rs:5270`) — client→agent: `CancelSessionNotification`
  + unstable NES doc notifications (`#[cfg(feature="unstable_nes")]`).
- **`AgentRequest`** (`client.rs:2145`) — the **client** handles these (agent sends):
  `RequestPermissionRequest`, `CreateElicitationRequest`, +
  `#[cfg(feature="unstable_mcp_over_acp")]` `ConnectMcpRequest`/`MessageMcpRequest`.
- **`AgentNotification`** — the `session/update` stream the client consumes.

> Unstable v2 surfaces are **cargo features** (`unstable_nes`, `unstable_mcp_over_acp`,
> `unstable_tool_call_name`, …) **and** capability flags. Off by default.

## 9. Extensibility, capability & schema rules

- Match every enum with a **wildcard arm** (`#[non_exhaustive]` + untagged `Other`).
- Capability support = **presence check**: `caps.session.prompt.image.is_some()` (v1 was
  `promptCapabilities.image === true`).
- `initialize` v2: both sides send role-agnostic `info` (required) + `capabilities`
  (no more `clientInfo`/`agentInfo`/…). Send `protocolVersion: 2`.
- IDs are **domain-typed**: `messageId`, `toolCallId`, `planId`, `sessionId`, `providerId`,
  `serverId`.
- **Schema 1.5** (what the core crate pins): semantic newtypes for
  paths/media-types/IDs/cursors; `DiffPatch.diff` → `DiffPatch.text`; terminal state+output
  update types. **Schema 1.6**: `Cancelled` tool-call + plan-entry statuses; programmatic
  tool-call names need **both** `unstable_protocol_v2` **and** `unstable_tool_call_name`.

## 10. Removed in v2 (do NOT port from crow-cli v1)

Session modes (`set_mode`, `current_mode_update`, `SessionMode*` → config options);
client fs (`fs/read_text_file`, `fs/write_text_file`); client terminal execution
(`terminal/create|output|release|wait_for_exit|kill`) + `clientCapabilities.fs`/`.terminal`;
`session/load`; top-level `authenticate`/`logout`; v1 `Diff.oldText/newText` (→ `git_patch`
+ structured file ops); the v1 `tool_call` vs `tool_call_update` split (→ single
`ToolCallUpdate` upsert + `ToolCallContentChunk`); deprecated MCP HTTP+SSE transport
(→ stdio is `session.mcp.stdio`; HTTP is the remote transport; MCP configs carry a
required `type` discriminator).

## 11. Scaffold: crow-cli v2 = a PERSISTENT Rust ACP agent

Goal per Thomas: convert crow-cli to Rust on ACP v2 as a **persistent** agent; **the whole
monorepo goes Rust**; **MCP is the protocol for Rust tools**; **crow-memory moves to native
lancedb** (no Python FFI). "TUIs are useless for automation" — the interactive surface is a
thin line client, not a TUI.

```
crow-cli-v2/                       # new crate, edition 2024, rust-version 1.88
├── Cargo.toml
└── src/
    ├── main.rs                    # clap: serve (persistent) | run (one-shot) ; --transport stdio|http
    ├── agent.rs                   # CrowAgent: impl ConnectTo<Client>, Agent.v2() handler chain (§6)
    ├── session.rs                 # per-session state (Arc<Mutex<…>> + Notify), history for replay
    ├── prompt.rs                  # process_prompt: the react loop + model call; emits the §4 update sequence
    ├── tools/                     # MCP client wiring (-rmcp): terminal, fs, memory, web_search …
    └── transport.rs               # stdio (AcpAgent/Acpn) AND http (AcpHttpServer) serving
crow-memory-rs/                    # native lancedb (Rust), exposed as an MCP server (or linked lib)
crow-*-mcp/                        # the other tools, each a Rust MCP server
```

Cargo.toml deps:
```toml
[dependencies]
agent-client-protocol        = { path = "../rust-sdk/src/agent-client-protocol", features = ["unstable_protocol_v2"] }
agent-client-protocol-schema = { version = "*", features = ["unstable_protocol_v2"] }
agent-client-protocol-http   = { path = "../rust-sdk/src/agent-client-protocol-http", features = ["server"] }  # persistent transport
agent-client-protocol-rmcp   = { path = "../rust-sdk/src/agent-client-protocol-rmcp" }                          # MCP tools
tokio = { version = "1", features = ["full"] }
clap  = { version = "4", features = ["derive"] }
lancedb = "*"            # native Rust, replaces the Python FFI
serde_json = "1"; anyhow = "1"
```

Build order that de-risks: (1) stdio agent that echoes via the §4 update sequence (port
`testy/v2.rs` almost verbatim) → (2) swap the echo for the real react loop + one MCP tool
→ (3) native-lancedb crow-memory MCP server → (4) HTTP transport for persistence +
`session/list`/`resume` durability → (5) conductor/proxy or judge-session for the verifier.

**Do NOT** build a TUI. **Do NOT** buffer updates in `V2Session` (it can't). **Do NOT**
block handler closures on slow work — `connection.spawn` + resolve the `Responder` async.

## 12. Design intents (parked so they aren't lost)

- **Persistent agent** over the per-spawn model: serve over HTTP/WS (`-http`
  `AcpHttpServer`), keep session state resident, durable via `session/list`+`resume`.
  Decision to make early: stdio vs HTTP transport (crow-ade the IDE must grow the matching
  v2 client path; `AcpAgent` stdio stays as one transport among several).
- **MCP as the tool protocol** (v2-native, since client fs/terminal are gone): terminal,
  fs, web_search, and memory each become Rust MCP servers the agent connects to (`-rmcp`).
- **crow-memory on native lancedb** (Rust) — kills the Python FFI and permanently removes
  the resident-PyTorch footprint we already offloaded to ollama (`crow-memory/embed.py`).
  Embedding stays ollama-backed; the store/search becomes Rust.
- **Whole-monorepo Rust** rewrite (crow-cli, the MCP tools, crow-memory).
- **Model the agent drives:** self-hosted `deepseek-v4-lite-0731` (Q2 quant) is the
  current target — fine for dev/self-host; the agent brings its own model config.
- **Capability-aware model registry + fallback chain + auto-strip modalities on
  downgrade** + retry-on-transient-400 (the `crow-cli/TODO.md` "Download multimodal file
  timed out" item) live in `prompt.rs`, in-process, **no litellm**. v1 react loop +
  `store.py` are FROZEN — do not patch them.
- **Orchestration + subagent verifier/judge** via §4 patterns and/or the **conductor**
  proxy-chain crate.
- **`~/.agents/crow`** canonical global home — **DONE (2026-08)**, and the
  Python crow-cli stack migrated onto it too (CONFIG_DIR `~/.crow` →
  `~/.agents/crow`; skills decoupled to `~/.agents/skills`; notes →
  `~/.agents/notes`). `~/.crow` holds inert legacy v1 data only (crow.db,
  state.db, old memory.lance) — deliberately not deleted.

## 13. Source pointers (re-verify in one grep)

**Live hosted docs index:** `https://agentclientprotocol.com/llms.txt` (all protocol pages + RFDs).

**Spec repo** `~/src/crow-team/agent-client-protocol`:
- `docs/announcements/acp-v2-draft.mdx` (themes) · `docs/rfds/v2/overview.mdx` (manifest)
- `docs/rfds/v2/prompt.mdx` + `docs/protocol/v2/prompt-lifecycle.mdx` (orchestration core)
- `docs/protocol/v2/migration.mdx` (the two v1→v2 tables) · `docs/rfds/v2/*.mdx` (all RFDs)
- Wire types: `agent-client-protocol-schema/src/v2/{client.rs (SessionUpdate:99,
  StateUpdate:464, AgentRequest:2145), agent.rs (ClientRequest:5008, ClientNotification:5270),
  content.rs, plan.rs, terminal.rs, tool_call.rs, protocol_level.rs}`
- `schema/v2/schema.json` (+ `schema.unstable.json`) — machine-readable truth

**rust-sdk** `~/src/crow-team/rust-sdk`:
- `md/protocol-v2.md` — **THE** v2 SDK usage doc (read first)
- `src/agent-client-protocol-test/src/testy/v2.rs` — **worked v2 AGENT** (crow-cli v2 template)
- `src/agent-client-protocol-test/tests/testy_v2.rs` — **worked v2 CLIENT** (orchestrator template)
- `src/agent-client-protocol/src/role/acp.rs` — `Agent.v2()`/`Client.v2()`, `connect_with`, routers
- `src/agent-client-protocol/src/session/v2.rs` — client `V2Session`/`V2SessionBuilder`
- `src/agent-client-protocol/src/acp_agent.rs` — `AcpAgent`/`AcpAgentConfig`/`Acpn`
- `src/agent-client-protocol-http/src/lib.rs` — `AcpHttpServer`/`HttpClient` (persistent)
- `src/agent-client-protocol-conductor/src/lib.rs` — proxy-chain orchestration
- `src/agent-client-protocol-rmcp/` — MCP bridge · `src/agent-client-protocol-yopo/` — client binary
- `md/migration_v2.0.md`, `md/protocol.md`, `md/design.md`, `md/transport-architecture.md`

**Recon that worked** (rg on text, sg on real Rust; sg on `schema/v2` shim finds nothing):
```sh
cd ~/src/crow-team/agent-client-protocol
rg -no '"(initialize|auth/[a-z]+|session/[a-z_]+)"' schema/v2/schema.json | sort -u
rg -n -A30 'pub enum (SessionUpdate|StateUpdate|AgentRequest|ClientRequest) \{' agent-client-protocol-schema/src/v2
cd ~/src/crow-team/rust-sdk
rg -n 'pub (async )?fn (connect_with|connect_to|build_session|send_prompt|on_receive_request)' src/agent-client-protocol/src
```

## 14. Gotchas

- **crow-cli is the AGENT, crow-ade is the CLIENT.** Don't scaffold the wrong role.
- **DRAFT → will change.** Re-grep before trusting a variant/field name; this file is a
  fallible prior.
- **Runtime is v1-at-HEAD with v2 behind `unstable_protocol_v2`.** No shipped v2 example;
  the two Testy files are the reference.
- **No `-tokio` crate.** Transport + spawn are in the core crate.
- **Handler arity:** connection is an optional trailing arg; requests are
  `(req, responder[, connection])`, notifications are `(notif[, connection])`.
- **`connect_with`'s closure owns the connection** and returns `R`; structure the app
  inside it (or clone handles out over channels).
- **One foreground prompt per session**; the agent must enforce it.
- **Handlers before new/resume; unhandled v2 notifications are dropped.** Buffer your own.
- **v1↔v2 never auto-converts**; dual-stack via `protocol_router()`/`protocol_connector()`.
- **`#[non_exhaustive]` everywhere** → always a wildcard match arm.
- **Unstable = cargo feature AND capability flag**, both, off by default.
- **sg/rg target the right crate:** wire types = `agent-client-protocol-schema/src/v2`;
  `schema/v2/src/lib.rs` is a 3-line marker.
