---
name: openai-streaming-tools
description: OpenAI Chat Completions streaming tool call accumulation — the wire
  format, the index-keyed accumulation algorithm, the tool_call_id contract that
  links assistant messages to tool results, provider quirks, and the async-openai
  Rust types. Use when building or debugging a react loop, streaming tool calls,
  assembling conversation history with tool results, or touching anything in
  react.rs / process_response / execute_tool_calls. Also covers how ACP v2
  ToolCallUpdate IDs relate (separate namespace, do NOT conflate). Trigger
  keywords — streaming tool calls, tool_call accumulation, tool_call_id, delta
  index, react loop, function calling stream, parallel tool calls.
---

# OpenAI Chat Completions — Streaming Tool Calls

> **Source:** OpenAI API reference (developers.openai.com), community-verified
> wire captures, the Python crow-cli react.py (ground truth, works in
> production), and the async-openai 0.41.3 Rust types (our fork at
> `~/src/crow-team/async-openai`). Everything below was read from those sources,
> not recalled.

## 0. The one rule

**The LLM's `id` is sacred.** It is the ONLY link between the assistant
message's `tool_calls[].id` and the tool result message's `tool_call_id`.
You MUST preserve it as-is. Never generate a UUID, never substitute, never
"fix" an empty ID. If the provider sends `""`, you use `""` consistently in
both the assistant message and the tool result. Breaking this link corrupts
the conversation history and the LLM will lose track of what tool returned
what.

## 1. The wire format (Chat Completions, `stream: true`)

Each SSE chunk is a `chat.completion.chunk` object. Tool calls arrive inside
`choices[0].delta.tool_calls` — an array of deltas:

```jsonc
// FIRST chunk for a tool call (index 0):
{
  "choices": [{
    "index": 0,
    "delta": {
      "role": "assistant",
      "content": null,
      "tool_calls": [{
        "index": 0,                    // REQUIRED — accumulation key
        "id": "call_xZtWnTjjc0jhg",   // present ONLY here
        "type": "function",            // present ONLY here
        "function": {
          "name": "get_weather",       // present ONLY here
          "arguments": ""              // empty or first fragment
        }
      }]
    },
    "finish_reason": null
  }]
}

// SUBSEQUENT chunks (same tool call):
{
  "choices": [{
    "index": 0,
    "delta": {
      "tool_calls": [{
        "index": 0,                    // same index → same tool call
        "function": {
          "arguments": "{\"loc"        // fragment to CONCATENATE
        }
        // NO id, NO type, NO name
      }]
    },
    "finish_reason": null
  }]
}

// FINAL chunk:
{
  "choices": [{
    "index": 0,
    "delta": {},
    "finish_reason": "tool_calls"      // signals tool calling done
  }]
}
```

### Field presence rules

| Field | First chunk | Subsequent chunks |
|---|---|---|
| `index` | **always** | **always** |
| `id` | yes | absent |
| `type` | yes | absent |
| `function.name` | yes | absent |
| `function.arguments` | yes (may be `""`) | yes (fragments) |

**`index` is the ONLY reliable accumulation key.** It is always present.
The `id`, `type`, and `name` arrive exactly once, in the first delta for
that index.

### Parallel tool calls

When the model calls multiple tools, they get different `index` values
(0, 1, 2, …). Chunks for different indices may interleave:

```
chunk: tool_calls: [{index: 0, id: "call_aaa", function: {name: "read", arguments: ""}}]
chunk: tool_calls: [{index: 1, id: "call_bbb", function: {name: "write", arguments: ""}}]
chunk: tool_calls: [{index: 0, function: {arguments: "{\"file"}}]
chunk: tool_calls: [{index: 1, function: {arguments: "{\"path"}}]
```

Accumulate each index independently.

## 2. The accumulation algorithm

```
accumulator: Map<u32, (id: String, name: String, arguments: String)>

for each chunk:
    for each tool_call_delta in chunk.choices[0].delta.tool_calls:
        entry = accumulator.entry(tool_call_delta.index).or_default()
        if let Some(id) = tool_call_delta.id:
            entry.id = id              // set once, from first chunk
        if let Some(name) = tool_call_delta.function.name:
            entry.name = name          // set once, from first chunk
        if let Some(args) = tool_call_delta.function.arguments:
            entry.arguments += args    // CONCATENATE fragments
```

After the stream ends (`finish_reason == "tool_calls"` or stream exhausted),
the accumulator holds the fully assembled tool calls. Sort by index for
deterministic ordering.

### Python crow-cli (ground truth, `react.py:process_chunk`)

```python
if delta.tool_calls:
    for call in delta.tool_calls:
        index = call.index
        if index not in tool_calls:
            tool_calls[index] = {"id": "", "function_name": "", "arguments": []}
        if call.id:
            tool_calls[index]["id"] = call.id
        if call.function.name:
            tool_calls[index]["function_name"] = call.function.name
        if call.function.arguments:
            tool_calls[index]["arguments"].append(arg_fragment)
```

Note: arguments are collected as a list of fragments, joined at the end with
`"".join(tool_call["arguments"])`.

### Rust crow-cli (`react.rs`)

```rust
let mut tc_accum: HashMap<u32, (String, String, String)> = HashMap::new();
// ...
if let Some(calls) = &delta.tool_calls {
    for call in calls {
        let entry = tc_accum.entry(call.index).or_default();
        if let Some(id) = &call.id {
            entry.0 = id.clone();
        }
        if let Some(f) = &call.function {
            if let Some(name) = &f.name {
                entry.1 = name.clone();
            }
            if let Some(args) = &f.arguments {
                entry.2.push_str(args);
            }
        }
    }
}
```

## 3. The round-trip (conversation history contract)

After accumulation, the assembled tool calls go into the assistant message.
Tool results reference them by `id`. This is the contract the LLM expects:

### Assistant message (persisted + sent back to LLM)

```json
{
  "role": "assistant",
  "content": null,
  "tool_calls": [
    {
      "id": "call_xZtWnTjjc0jhg",
      "type": "function",
      "function": {
        "name": "get_weather",
        "arguments": "{\"location\": \"Paris\"}"
      }
    }
  ]
}
```

### Tool result message (one per tool call)

```json
{
  "role": "tool",
  "tool_call_id": "call_xZtWnTjjc0jhg",
  "content": "15°C, partly cloudy"
}
```

**`tool_call_id` MUST equal the `id` from the assistant's `tool_calls`
entry.** This is how the LLM knows which result belongs to which call.
If you have 3 parallel tool calls, you send 3 tool result messages, each
with the matching `tool_call_id`.

### Next request

The messages array sent back to the LLM:
```
[..., assistant_msg_with_tool_calls, tool_result_0, tool_result_1, ...]
```

The LLM then generates a response incorporating the results, possibly
issuing more tool calls (another react loop iteration).

## 4. JSON argument repair

Models (especially Qwen, DashScope) sometimes produce truncated JSON in
arguments. The Python crow-cli repairs this before persisting:

1. Try `json.loads(arguments_str)` — if valid, done.
2. Count unmatched `{` and `[`, append closing `}` and `]`.
3. Try parsing again. If still invalid, fall back to `"{}"`.

The Rust port does the same in `repair_json_args()`. This is important
because malformed JSON in the assistant message will cause API errors when
sent back to the LLM on the next turn.

## 5. Provider quirks

| Provider | `id` sent? | `name` sent? | Notes |
|---|---|---|---|
| OpenAI (GPT-4o, etc.) | yes | yes | Reference implementation |
| DashScope (Qwen) | yes | yes | Sometimes truncated JSON args |
| alibaba `compatible-mode` (qwen3.8-max-preview) | yes, THEN `""` | yes, THEN `""` | ⚠️ see below |
| llama.cpp server | yes | yes | IDs are `call_` prefixed |
| Ollama | varies | yes | Some models omit IDs |
| vLLM | yes | yes | OpenAI-compatible |

**If a provider doesn't send `id`:** the accumulator stays `""`. That's
fine — use `""` consistently in both the assistant message and tool result.
The link is maintained. Do NOT generate a replacement UUID.

**⚠️ The empty-string overwrite trap (REAL, cost us a day):** the
alibaba `compatible-mode` endpoint sends the REAL `id` and `name` in the
FIRST delta, then sends `id: Some("")` and `name: Some("")` — empty
STRINGS, not null/absent — on every continuation delta. A naive
`if let Some(id) = &call.id { entry.0 = id.clone(); }` accumulator
overwrites the real values with `""`, producing `Unknown tool: ''` at
execution time while the arguments accumulate fine (maddening: args look
correct in logs). Fix: only overwrite when non-empty:

```rust
if let Some(id) = &call.id {
    if !id.is_empty() { entry.0 = id.clone(); }
}
if let Some(name) = &call.function.as_ref().and_then(|f| f.name.as_ref()) {
    if !name.is_empty() { entry.1 = name.clone(); }
}
```

Diagnose with a `tracing::debug!` on every delta printing
`idx/id/fn_name/fn_args` — the `Some("")` continuation deltas are
unmistakable. (crow-rs fix: crow-cli/src/react.rs, commit 92d54ad.)

## 6. async-openai Rust types (0.41.3, our fork)

All in `async_openai::types::chat::*` (feature `chat-completion`).

### Streaming delta types

```rust
// The chunk
pub struct CreateChatCompletionStreamResponse {
    pub id: String,
    pub choices: Vec<ChatChoiceStream>,
    pub usage: Option<CompletionUsage>,  // only in final chunk with stream_options
    // ...
}

pub struct ChatChoiceStream {
    pub index: u32,
    pub delta: ChatCompletionStreamResponseDelta,
    pub finish_reason: Option<FinishReason>,
}

pub struct ChatCompletionStreamResponseDelta {
    pub content: Option<String>,
    pub reasoning_content: Option<String>,  // OUR FORK ADDITION
    pub tool_calls: Option<Vec<ChatCompletionMessageToolCallChunk>>,
    pub role: Option<Role>,
    pub refusal: Option<String>,
}

// THE KEY TYPE — one entry per tool call delta
pub struct ChatCompletionMessageToolCallChunk {
    pub index: u32,                        // accumulation key, ALWAYS present
    pub id: Option<String>,                // first chunk only
    pub r#type: Option<FunctionType>,      // first chunk only
    pub function: Option<FunctionCallStream>,
}

pub struct FunctionCallStream {
    pub name: Option<String>,              // first chunk only
    pub arguments: Option<String>,         // fragments to concatenate
}
```

### Assembled types (for the assistant message)

```rust
// In the response message
pub struct ChatCompletionResponseMessage {
    pub content: Option<String>,
    pub reasoning_content: Option<String>,  // OUR FORK ADDITION
    pub tool_calls: Option<Vec<ChatCompletionMessageToolCalls>>,
    pub role: Role,
}

// Enum wrapper (0.41.x)
pub enum ChatCompletionMessageToolCalls {
    Function(ChatCompletionMessageToolCall),
    Custom(ChatCompletionMessageCustomToolCall),
}

pub struct ChatCompletionMessageToolCall {
    pub id: String,           // the LLM's ID — PRESERVE AS-IS
    pub function: FunctionCall,
}

pub struct FunctionCall {
    pub name: String,
    pub arguments: String,    // JSON string
}
```

### Tool result message (for sending back to LLM)

```rust
pub struct ChatCompletionRequestToolMessage {
    pub content: ChatCompletionRequestToolMessageContent,
    pub tool_call_id: String,  // MUST match assistant's tool_calls[].id
}
```

### Request-side tool definitions

```rust
// Tools on the request
pub enum ChatCompletionTools {
    Function(ChatCompletionTool),
    Custom(CustomToolDefinition),
}

pub struct ChatCompletionTool {
    pub function: FunctionObject,  // NO r#type field in 0.41.x
}

pub struct FunctionObject {
    pub name: String,
    pub description: Option<String>,
    pub parameters: Option<serde_json::Value>,
    pub strict: Option<bool>,
}
```

## 7. ACP v2 tool call IDs — SEPARATE namespace

ACP v2 `ToolCallUpdate.tool_call_id` is a **client-facing UI identifier**.
It tells the IDE "here's a tool call to render in the sidebar." It has
NOTHING to do with the OpenAI conversation-level `tool_call_id`.

You CAN use the LLM's ID as the ACP ID (natural choice, and what crow-cli
does). But they serve different purposes:

| | OpenAI `tool_call_id` | ACP `ToolCallUpdate.tool_call_id` |
|---|---|---|
| Purpose | Links assistant msg ↔ tool result in conversation history | Client UI tracks tool call lifecycle |
| Who assigns | The LLM (in the first streaming chunk) | The agent (can be anything unique) |
| Must match | assistant `tool_calls[].id` == tool result `tool_call_id` | First update creates, subsequent patch by same ID |
| Consequence of mismatch | LLM loses track of results, broken conversation | Client can't update the right UI element |

The Python crow-cli v1 used `f"{turn_id}/{llm_tool_call_id}"` as the ACP
ID — a derived composite. The Rust v2 port just uses the LLM ID directly.
Both are fine. What is NOT fine is generating a UUID for the OpenAI-level
ID.

## 8. Common mistakes

1. **Generating UUIDs for tool call IDs.** NO. The LLM's ID is the link.
   Use it as-is. If empty, use empty consistently.

2. **Keying accumulation by `id` instead of `index`.** The `id` is only
   in the first chunk. Subsequent chunks have no `id`. You MUST key by
   `index`.

3. **Discarding the first chunk because `content` is null.** The first
   tool call chunk has `content: null` but carries the `id`, `name`, and
   `type`. Don't skip it.

4. **Not repairing truncated JSON arguments.** Some models (Qwen) truncate
   arguments mid-stream. Repair before persisting or the next API call
   will reject the malformed assistant message.

5. **Sending tool results before the assistant message.** The messages
   array must be: `[..., assistant(tool_calls), tool(result), tool(result)]`.
   Order matters.

6. **Conflating ACP tool call IDs with OpenAI tool call IDs.** They're
   different namespaces serving different purposes. See §7.
