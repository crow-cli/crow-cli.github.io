---
name: plan-todo
description: The plan-todo development loop — how to run a long multi-task sprint
  without stopping to ask. Use when the user drops a big pivot or brain-dump of
  work ("write this down", "here's everything"), when starting a sprint, when a
  session says "TODO.md / PLAN.md", or when you are a compacted/next agent picking
  up unfinished work. Write unordered TODO, write ordered PLAN with explicit test
  criteria, then work item by item — finish, verify, mark done, update both files,
  move on — until everything is complete. No feedback-seeking mid-sprint.
---

# The plan-todo loop

Statefulness is compaction made durable. The sprint mandate lives in two files,
not in any agent's head — agents get compacted, files don't.

## The loop

1. **Receive the big ask.** A huge list of instructions, a pivot, a brain-dump.
   It MUST include (or you must extract) explicit testing criteria — what
   "verified" means for each chunk. If criteria are missing, derive them from
   the repo's test suite and say so; don't ask.
2. **Write the unordered TODO** (`TODO.md` at repo root). Every item goes in —
   scope capture, nothing lost. No ordering, no priority anxiety. Include the
   verification criteria with each item where they're known.
3. **Write the ordered PLAN** (`PLAN.md` at repo root). Numbered phases, numbered
   items inside phases. Each item: do it, verify it, mark it done, move on.
   Put the build command at the top. If phases execute out of numeric order,
   say so at the top ("Current trajectory: 10 → 11 → 12 → 9.6–9.8").
4. **Put the mandate at the top of BOTH files**, verbatim:

       ## **DO NOT ASK USER FOR FEEDBACK — THIS IS THE USER FEEDBACK.**
       ## **DO NOT ASK USER FOR NEXT STEPS — THESE ARE THE NEXT STEPS.**

   Any future agent — compacted, delegated, or fresh — reads the files first and
   inherits the mandate without needing the conversation that produced it.
5. **Work the PLAN, top uncompleted item first.** When you finish an item:
   - Verify it against its stated criteria (build, test, live eyeball — whatever
     the item says). No criteria were written? The repo's test suite is the floor.
   - Do NOT stop to seek feedback.
   - Mark it done in BOTH TODO.md and PLAN.md (with a one-line evidence note:
     date + what verified it).
   - Proceed to the next PLAN item.
   - Continue until everything in TODO and PLAN is complete.
6. **Done means done.** Only when every item is checked (or explicitly deferred
   with a reason written in TODO) do you report completion and ask what's next.

## Rules that keep the loop honest

- **Scope discovered mid-work goes into TODO.md IMMEDIATELY.** Never hold it in
  head — context gets compacted and the next agent only has the files.
- **Blocked ≠ stopped.** If an item is genuinely blocked (missing credential,
  destructive/irreversible action, real intent ambiguity), don't stall and don't
  guess: write the blocker into TODO/PLAN with the reason, skip to the next
  unblocked item, surface it in the end-of-sprint summary. Facts are for search;
  only genuine intent is ever asked — and a sprint almost never needs it.
- **Uncommitted = unfinished.** Commit at each natural checkpoint (one item or one
  coherent unit). A working tree full of never-compiled edits blocks everyone.
- **Edit the plan files in place.** One TODO.md, one PLAN.md, one truth. Never
  `-v2`. Re-read before editing; never edit from memory.
- **Evidence over vibes.** "Marked done" requires the thing actually ran: the
  build passed, the tests passed, the command was eyeballed. Write what verified it.
- **The user's rapid direction changes ARE the feedback.** When they interject,
  fold it into TODO/PLAN on the spot and keep moving — don't restart the loop.

## Picking up someone else's sprint (compacted/next agent)

1. Read `TODO.md` and `PLAN.md` top to bottom — the mandate headers apply to you.
2. `git status` + `git log --oneline -5`: find uncommitted work. Uncommitted
   edits are the most likely place the last agent died — finish them FIRST
   (they may never have compiled).
3. Find the first unchecked PLAN item in the stated trajectory. Do it. Verify it.
   Mark it. Move on.
