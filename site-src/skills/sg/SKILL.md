---
name: sg
description: Use ast-grep (sg) for AST-based structural code search, lint, and
  rewrite. Reach for it instead of grep/sed whenever a change is about CODE
  STRUCTURE rather than text — renaming an identifier/param/kwarg/attribute
  across a repo, changing a function signature and all its call sites, swapping
  one API for another, or linting for a code shape. It matches whole syntax-tree
  nodes so it never substring-matches (renaming `db_uri` will NOT touch
  `my_db_uri`), and it ignores strings/comments unless you target them. Covers
  `sg run` (one-shot search/rewrite), `sg scan` (YAML rules), `sg test`, metavar
  syntax, relational rules, and a detailed, empirically-verified list of what
  does and does NOT work (kwarg-pattern pitfalls, metavar gotchas, project setup).
---

# ast-grep (`sg`) — structural code search & rewrite

ast-grep matches **AST nodes, not text**. Think "grep that understands syntax."
A pattern is a snippet of real code; metavariables (`$X`) stand in for sub-nodes.
Because it works on the tree, it is the right tool for refactors that are about
*meaning* (rename this param everywhere, swap this call) rather than *bytes*.

Installed here: `~/.cargo/bin/sg` (also `ast-grep`), version **0.43.0**.
Run `sg --help`. Subcommands: `run` (default), `scan`, `test`, `new`, `lsp`.

Everything in the "does / does not work" sections below was run against this
binary on Python code. Trust it; it is empirical, not recalled.

---

## 1. The workhorse: `sg run` (one-shot search / rewrite)

```bash
sg run -p 'PATTERN' --lang python file_or_dir     # search, prints matches
sg run -p 'PATTERN' -r 'REWRITE' --lang python .  # preview a diff (no write)
sg run -p 'PATTERN' -r 'REWRITE' --lang python -U .   # APPLY (-U = update-all)
sg run -p 'PATTERN' --lang python --json .        # structured JSON for scripts
```

- **Always preview first** (drop `-U`), read the diff, then re-run with `-U`.
  Follow with `git diff` to review what actually changed.
- `--lang` is inferred from the file extension for explicit file args (verified:
  `sg run -p 'db_uri' edge.py` worked with no `--lang`). Specify it anyway when
  scanning directories, when extensions are ambiguous, or when piping stdin.
- `-p` is the pattern, `-r`/`--rewrite` is the replacement. Metavars captured in
  the pattern (`$X`) can be reused in the rewrite.

### The rename playbook (verified end-to-end)

Renaming a symbol is rarely one operation, because a name lives in several AST
positions. For `db_uri` → `memory_url` the verified recipe is three passes:

```bash
# 1. The identifier itself: def params, call kwarg NAMES, attribute names
#    like `.db_uri`, bare local usages, and kwarg VALUES. One shot, all of it.
sg run -p 'db_uri' -r 'memory_url' --lang python -U .

# 2. Private attributes: `self._db_uri` is the identifier `_db_uri`, a DIFFERENT
#    node than `db_uri`, so pass 1 skips it. Bare `_db_uri` reaches inside
#    `self._db_uri` (verified).
sg run -p '_db_uri' -r '_memory_url' --lang python -U .

# 3. String-literal keys: `"db_uri"` in dicts/config. Identifier patterns never
#    touch string contents, so target the literal explicitly.
sg run -p '"db_uri"' -r '"memory_url"' --lang python -U .
```

Why three passes and not one? Because of the whole-node rule (next section):
`db_uri`, `_db_uri`, and `"db_uri"` are three distinct node texts. This is a
feature — it is what makes the rename *safe*.

---

## 2. The mental model: whole nodes, not substrings

**Verified:** with `my_db_uri`, `xdb_uri`, and `db_uri` all in one file,
`sg run -p 'db_uri'` matched ONLY the bare `db_uri`. It never substring-matches.

Consequences (all good):
- Renaming `db_uri` cannot corrupt `my_db_uri`, `xdb_uri`, `db_uri_old`.
- An identifier pattern matches the identifier in *every* position it appears as
  that exact node: function **params**, call **kwarg names** (`load(db_uri=x)`),
  **attribute names** (`self.db_uri`), and bare **usages**. Verified: a single
  `sg run -p 'db_uri' -r 'memory_url'` rewrote all four positions at once.
- It does **not** match inside string literals or comments. Target those
  explicitly (`'"db_uri"'`) if you want them.

---

## 3. Metavariables

| Syntax | Meaning |
|---|---|
| `$X` | match any **single** AST node (like regex `.`, but structural) |
| `$$$` | match **zero or more** nodes (args, params, statements) |
| `$$$ARGS` | named multi-match; `ARGS` binds to a list |
| `$_` / `$_FOO` | **non-capturing** wildcard (leading `_`); faster, no bookkeeping |
| `$$VAR` | capture **unnamed** nodes (advanced; tree-sitter named-vs-anonymous) |

- Names: `$` + uppercase/`_`/digits only. `$VAR`, `$_`, `$_123` valid.
  `$invalid`, `$Svalue`, `$123`, `$KEBAB-CASE` are **not** metavars.
- **Equality constraint:** reusing a name forces equality. `$A == $A` matches
  `a == a` and `1+1 == 1+1` but not `a == b`.
- Captured metavars are reusable in the rewrite: `-p '$X = $Y' -r '$Y = $X'`
  swaps assignment sides.

---

## 4. YAML rules + `sg scan` (lint & batch rewrite)

For anything reusable, precise, or relational, write a rule file:

```yaml
# rules/self-db-uri.yml
id: self-db-uri-attr        # must be unique across all ruleDirs
language: Python
rule:
  pattern: self.db_uri
  inside:                    # relational: only match within a class body
    kind: class_definition
    stopBy: end
fix: self.memory_url
message: rename self.db_uri to self.memory_url
severity: warning            # error | warning | info | hint
```

```bash
sg scan -r rules/self-db-uri.yml .        # use one explicit rule file
sg scan .                                  # use rules from sgconfig.yml ruleDirs
sg scan -r rules/foo.yml --update-all .    # apply fixes
```

Relational/atomic rule keys that work (verified `inside`+`kind`+`stopBy`):
`pattern`, `kind`, `regex`, `any`, `all`, `not`, `inside`, `has`, `follows`,
`precedes`, `stopBy`, `field`, `constraints`. `constraints` lets you pin a
metavar to a kind/regex/pattern (e.g. only match `$F` when it is an identifier).

---

## 5. Project setup + testing rules

```bash
sg new            # scaffold: sgconfig.yml, rules/, testcases/  (interactive)
sg test           # run rule tests (REQUIRES sgconfig.yml — errors without it)
```

Canonical layout (verified): the **test dir is a SIBLING of the rule dir, never
nested inside it** (ruleDirs is recursive; nesting testcases under a ruleDir
causes "Duplicate rule id" errors).

```
proj/
  sgconfig.yml
  rules/
    rename.yml
  rule-tests/          # sibling, referenced by testConfigs
    rename-test.yml
```

```yaml
# sgconfig.yml
ruleDirs:
  - rules
testConfigs:
  - testDir: rule-tests
```

Test files are **YAML** (not markdown), keyed by rule `id`, with `valid`
(should NOT report) and `invalid` (SHOULD report) source snippets:

```yaml
# rule-tests/rename-test.yml
id: self-db-uri-attr
valid:
  - x = self.memory_url
invalid:
  - x = self.db_uri
```

`sg test --skip-snapshot-tests` → `PASS self-db-uri-attr ..` (verified).
Test output uses detection-theory labels: **Reported** (correct), **Noisy**
(reported on valid code = bad), **Missing** (silent on invalid = bad),
**Validated** (correct silence).

---

## 6. WHAT DOES NOT WORK — the gotchas (all verified)

This is the section that saves you an afternoon. Each item was run on 0.43.0.

1. **A bare kwarg fragment is not a node.** `sg run -p 'db_uri=$V'` matches
   *nothing*. `name=value` only exists *inside* a call; alone it is an
   unparseable fragment. To target a kwarg you must give the surrounding call.

2. **The kwarg "sandwich" pattern fails.** `$F($$$A, db_uri=$V, $$$B)` (two
   multi-metavars around a specific arg) matched **nothing**. The working form
   is a **single leading `$$$` with the target kwarg trailing**:
   `$F($$$, db_uri=$V)` matched. So matching a specific kwarg by pattern is
   **position-brittle** (it also fails if the kwarg is not last, e.g.
   `$F(db_uri=$V)` fails when earlier args exist).

   **Practical conclusion:** to rename a kwarg *name*, do NOT do kwarg-pattern
   surgery — use the blanket identifier rename (`sg run -p 'db_uri' -r
   'memory_url'`), which rewrites kwarg names reliably regardless of position.

3. **Metavar + literal text in one node silently matches nothing.**
   `sg run -p 'use$HOOK'` → no output, no error. You cannot glue text onto a
   metavar inside a single identifier (`mix$VAR`, `use$HOOK` are dead). Match
   the whole node and rewrite it, or use a `regex` rule.

4. **Uppercase-append footgun in rewrites.** In a `fix`, `$VARName` parses as
   `$VARN` + `ame`, not `$VAR` + `Name`. To append text to a captured value use
   a `transform` with regex capture groups, not string concatenation.

5. **Non-matched metavar in `fix` → empty string.** If a metavar is optional in
   the pattern and did not bind, it expands to nothing in the rewrite.

6. **Identifier patterns never see string contents or comments.** `db_uri`
   won't match `"db_uri"` or `# db_uri`. This is usually what you want; when it
   is not, target the literal (`'"db_uri"'`) or use `kind: string` + `regex`.

7. **Rewrite is indentation-sensitive.** The indentation of a metavar in the
   `fix` block is preserved relative to the match. Multi-line fixes (e.g.
   lambda→def) can come out misindented; check the diff.

8. **`sg test` needs a project.** Run without `sgconfig.yml` it errors:
   "No ast-grep project configuration is found." Use `sg new` or write one.

9. **Duplicate rule ids across ruleDirs fail the whole scan.** ids must be
   globally unique across every directory `ruleDirs` reaches (recursive).

---

## 7. Scripting (`--json`)

`sg run -p 'PAT' --lang python --json .` emits an array of matches, each with:
`text`, `range` (`byteOffset` + `start`/`end` line/column), `file`, `lines`
(the source line), `language`. Use this to drive edits from Python instead of
parsing colored diff output. (There is also a Python API: `pip install
ast-grep-py` — `from ast_grep import AstGrep` — for in-process use.)

---

## 8. Quick recipe cheat-sheet

```bash
# rename a symbol safely (preview, then apply)
sg run -p 'old_name' -r 'new_name' --lang python .        # preview
sg run -p 'old_name' -r 'new_name' --lang python -U .     # apply

# find all calls to a function
sg run -p 'requests.get($$$)' --lang python .

# rewrite calls, keeping args
sg run -p 'requests.get($$$A)' -r 'httpx.get($$$A)' --lang python -U .

# match a def and its body
sg run -p 'def $F($$$ARGS):
  $$$BODY' --lang python .

# only report (lint) with a YAML rule
sg scan -r rules/my-rule.yml .
```

**Rule of thumb:** if you are about to write a `sed` with word-boundary hacks,
or a grep you will then hand-edit, use `sg` instead — it matches structure and
cannot clobber substrings. Preview without `-U`, read the diff, then apply.
