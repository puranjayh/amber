<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:amber -->

# AMBER

**Read `docs/CONTRACT.md` before writing any code.** It is the single source of truth for
ownership, types, and the checkpoint schedule.

We work in five parallel git worktrees. Check which one you are in and stay in your lane —
editing another agent's files causes merge conflicts nobody has time to fix at 3am.

| Worktree | Branch | Agent | Owns |
|---|---|---|---|
| `amber` | `main` | — | integration only, no feature work |
| `amber-engine` | `eng/engine` | Claude Code | `src/contracts/**`, `src/engine/**` |
| `amber-compiler` | `eng/compiler` | Codex | `src/compiler/**` |
| `amber-app` | `eng/app` | Cursor (laptop 1) | `app/**`, `components/**` |
| `amber-data` | `eng/data` | Cursor (laptop 2) | `data/**`, `fixtures/**` |

Shared types come from `@/src/contracts` and nowhere else. Never import across lanes.

`src/contracts` is FROZEN at 00:00 Saturday.

## The four rules that matter most

1. Absent fact → UNKNOWN. Stale beyond `maxAgeDays` → UNKNOWN. **Never FAIL.**
   Absence of evidence is not evidence of absence — this is the entire project.
2. No LLM call scores a patient. The model extracts and structures; every eligibility
   decision is deterministic code with explicit comparisons and exact date math.
3. Every cell carries a citation — the trial's words and the record's words.
4. The engine is pure: no fetch, no fs, no db, no `Date.now()` (pass `asOf` in).

Commit prefixes: `eng:` `comp:` `app:` `data:` `docs:`. Push every 30 minutes even if
broken. Only P1 merges to `main`.

<!-- END:amber -->
