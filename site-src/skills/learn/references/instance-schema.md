# Test Instance Schema

Each test instance is a directory under `assets/bench/instances/`:

```
NNN-short-description/
├── problem.md        # The user's original request (verbatim or reconstructed)
├── context.json      # Optional: conversation history up to the failure point
├── expected.md       # What a correct agent would have done
└── score_rubric.md   # Scoring criteria (0-5 scale per dimension)
```

## problem.md

The task as the user would state it. Include:
- The goal ("I want to...")
- Relevant context (file paths, error messages, constraints)
- Any implicit expectations

## context.json

Optional. Array of messages from the original session:
```json
[
  {"role": "user", "content": "..."},
  {"role": "assistant", "content": "..."},
  ...
]
```
Only include messages up to the point where the agent went wrong.
The bench runner feeds these as conversation history before the problem.

## expected.md

What a correct agent would do. Not a script — a description of the
correct approach, key decisions, and expected output.

## score_rubric.md

Scoring criteria. Example:

```
## Correctness (0-5)
- 5: Fully solves the problem, correct output
- 3: Partially solves, minor issues
- 1: Wrong approach or broken output
- 0: No meaningful progress

## Efficiency (0-3)
- 3: Minimal steps, no wasted work
- 2: Some unnecessary steps
- 1: Significant wasted effort
- 0: Went in circles

## Tool Usage (0-2)
- 2: Right tools, right order
- 1: Suboptimal tool choices
- 0: Missed obvious tools or used wrong ones
```

## Naming Convention

`NNN` is a zero-padded sequence number: `001`, `002`, etc.
Short description is lowercase-hyphenated: `001-fix-import-error`.
