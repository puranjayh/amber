# AMBER — build contract

Every agent reads this file first. It is the single source of truth for who owns what,
what the types are, and when things integrate. If this file and a prompt disagree, this
file wins.

**What we are building:** trial eligibility screening that answers "what is missing"
instead of "eligible yes/no". Criteria are compiled from protocol prose into executable
logic trees. Patients are evaluated with three-valued logic — PASS / FAIL / UNKNOWN — in
deterministic code with no model inference in the scoring path.

---

## 1. Ownership — do not edit outside your lane

| Path | Owner | Agent | Worktree |
|---|---|---|---|
| `src/contracts/**` | P2 | Claude Code | `amber-engine` |
| `src/engine/**` | P2 | Claude Code | `amber-engine` |
| `src/compiler/**`, `src/eval/**`, `src/claims/**`, `data/raw/**`, `data/claims/**` | P1 | Codex | `amber-compiler` |
| `app/**`, `components/**` | P3 | Cursor (laptop 1) | `amber-app` |
| `data/**` (except `raw/` and `claims/`), `fixtures/**` | P4 | Cursor (laptop 2) | `amber-data` |
| `docs/**`, `package.json`, merges to `main` | P1 | — | `amber` |

`data/raw/` is compiler output, so the compiler owns it — it is gitignored, not committed.
`package.json` belongs to P1: if any lane needs a dependency or an npm script, ask in
Discord and P1 adds it on `main`. **Test runner is vitest for every lane** — installed on
`main`, run with `npm test`.

### Generated filename ownership

| Filename | Sole writer | Contents |
|---|---|---|
| `data/compiled/coverage.json` | Engine | Claims-answerability coverage figures |
| `data/compiled/compile-stats.json` | Compiler | Corpus compilation, rejection, demo-pool, and review counts |

No lane may reuse a filename in this table for a different read model.

`src/contracts` is **FROZEN AT 00:00 Saturday.** Before then, announce any change in
Discord. After then, a change needs all four people to agree.

### The only cross-lane import

Everything imports from `src/contracts`. Nothing imports from another lane's folder. Ever.

```ts
import { Trial, Patient, CubeCell, Verdict } from "@/src/contracts";
```

The scaffold was created with `--no-src-dir`, so Next routes live in `/app` and `/src` is
plain TypeScript modules. The default `@/*` alias resolves from the repo root.

---

## 2. Fixtures unblock everyone

**P4 hand-writes these in the first 45 minutes**, valid against `src/contracts`:

- `fixtures/trials.sample.json` — 3 trials
- `fixtures/patients.sample.json` — 3 patients: a hero case with exactly 2 unknowns, a
  true exclusion on prior osimertinib, and one whose labs are stale
- `fixtures/cube.sample.json` — the expected evaluation output for those 3 × 3

P3 builds the **entire** UI against fixtures and never waits for the compiler.
P2 tests the engine against fixtures and never waits for real data.
Three people are blocked until these exist. They ship before anything else.

---

## 3. Core types

Authoritative definitions are the zod schemas in `src/contracts`. This is the summary.

```
Verdict        = "PASS" | "FAIL" | "UNKNOWN"
Predicate      = age | lab_value | biomarker | prior_therapy | performance_status
               | diagnosis | staging | washout | comorbidity | contraindication
Tier           = 0 existing specimen | 1 blood draw or in-clinic | 2 imaging
               | 3 invasive | 4 time-bound (cannot be bought, only waited)

CriterionLeaf  { kind:"leaf", id, type:"inclusion"|"exclusion", predicate, operator,
                 value, unit?, maxAgeDays?, tier, sweepable?, sweepRange?, sweepStep?,
                 sourceSpan }
CriterionGroup { kind:"group", op:"AND"|"OR"|"NOT", children: CriterionNode[] }
CriterionNode  = CriterionLeaf | CriterionGroup

Trial    { nctId, title, phase, slots, condition, criteria: CriterionNode[],
           compilerConfidence, needsHumanReview }
Fact     { predicate, analyte?, drugClass?, value, unit?, observedAt, sourceQuote,
           sourceDoc }
Patient  { id, age, sex, race, ethnicity, zip, travelMinutes, facts: Fact[] }
CubeCell { patientId, nctId, criterionId, verdict, reason, criterionCitation,
           chartCitation?, tier, pFavorable? }
```

`reason` is one of: `satisfied` · `contradicted` · `absent` · `stale` · `unsupported`.

---

## 4. Hard rules

1. **The engine is pure.** No `fetch`, no `fs`, no database, no `Date.now()` — pass `asOf`
   in. It must be unit-testable with zero setup.
2. **No LLM call scores a patient.** The model extracts and structures. Every eligibility
   decision is deterministic code with explicit comparisons and exact date math.
3. **Every cell carries a citation.** A cell without one is a bug, not a cosmetic issue.
4. **Absent fact → UNKNOWN. Stale beyond `maxAgeDays` → UNKNOWN. Never FAIL.**
   Absence of evidence is not evidence of absence. This is the whole project.
5. **Reject, never coerce.** A compiled tree that fails zod validation gets
   `needsHumanReview: true` and its trial leaves the demo pool.
6. **Nested boolean logic is preserved as group nodes.** Never flatten an OR into a list.
7. **Amber means UNKNOWN and nothing else**, everywhere in the UI.

### Kleene truth tables

```
AND   any FAIL → FAIL;  else any UNKNOWN → UNKNOWN;  else PASS
OR    any PASS → PASS;  else any UNKNOWN → UNKNOWN;  else FAIL
NOT   PASS ↔ FAIL;      UNKNOWN stays UNKNOWN

Trial verdict: any inclusion FAIL, or any exclusion PASS → ELIMINATED (short-circuit)
```

### RULING — cell verdicts are CRITERION-oriented, not patient-oriented

Resolved 21:10 Friday. This supersedes any earlier wording in §8.

A `CubeCell.verdict` answers exactly one question, the same question for every criterion:

> **Does this predicate hold for this patient?**

It does NOT mean "is this good news for the patient." Polarity lives in exactly one
place — the trial-level elimination rule — and nowhere else.

```
Exclusion "prior EGFR TKI", patient took osimertinib
  → cell verdict PASS      (the predicate holds: they did take one)
  → trial verdict ELIMINATED

Exclusion "prior EGFR TKI", medication history shows none
  → cell verdict FAIL      (the predicate does not hold)
  → patient remains eligible

Exclusion "prior EGFR TKI", no medication history available
  → cell verdict UNKNOWN   (we cannot tell)
  → patient remains a candidate; this becomes resolvable work
```

Why this way: `evaluate()` stays uniform and never branches on criterion type, Kleene
composition over nested groups works without special cases, and UNKNOWN stays symmetric.

**Engine (P2):** the polarity suite asserts that a fact matching an exclusion yields cell
verdict **PASS** *and* trial-level **ELIMINATED**. It must never leave the patient
eligible. That is the bug the suite exists to catch.

**App (P3):** keep the patient-oriented colours — they read better on stage — but derive
them, never store them:

```ts
// green = good for this patient; independent of how the cell is stored
function displayTone(cell: CubeCell, type: "inclusion" | "exclusion") {
  if (cell.verdict === "UNKNOWN") return "amber";
  const good = type === "inclusion" ? cell.verdict === "PASS" : cell.verdict === "FAIL";
  return good ? "green" : "red";
}
```

The exclusion section header should read: *"green means the patient clears this
exclusion."*

**Data (P4):** `cube.sample.json` must encode the criterion-oriented convention. The
osimertinib patient's exclusion cell is `PASS`, and their `PairResult.eliminated` is
`true`.

**Group verdicts:** the engine emits cells for leaves only. The app computes group
verdicts for display with the Kleene tables above. If the engine later emits group
results, the app switches to those.

---

## 5. Git

Branches: `eng/engine` · `eng/compiler` · `eng/app` · `eng/data`, each in its own worktree.

- Commit prefixes: `eng:` `comp:` `app:` `data:` `docs:`
- **Push every 30 minutes even if broken.** A silent branch for four hours is an
  invisible integration bomb.
- Rebase onto `main` at checkpoints. Never merge into someone else's branch.
- P1 is the only person who merges to `main`.
- Want to fix something outside your lane? Add a line to `docs/HANDOFF.md` and keep going.

---

## 6. Checkpoints

| Time | Gate |
|---|---|
| **00:00 Sat** | `src/contracts` FROZEN |
| **04:00** | First integration. Engine evaluates 1 patient × 1 trial against fixtures. |
| **08:00** | **HARD GATE** — engine end-to-end and hand-verified. If not met, elasticity / matching / equity are cancelled and we ship the criteria table alone. |
| **14:00** | Integration. 300 trials compiled, first 20 trees human-verified, worklist renders. |
| **20:00** | Integration. Elasticity, equity audit, physician alert view. |
| **02:00 Sun** | **FEATURE FREEZE.** Polish only. |
| **07:00 Sun** | Submitted. Not 07:59. |

---

## 7. Build order — cut from the bottom

**Never cut:** criteria table with dual citations · three-valued engine · elasticity
slider · the compiler-defence slide.

Then, in order, stop when Saturday runs out:
equity audit + DAP-constrained assignment → stable matching → criteria landscape
histogram → screen-failure dollars → bipartite graph view → federated three-site demo →
eligibility calendar → travel burden.

**Cut first:** batch set cover · live scale benchmark (becomes a static number).

---

## 8. Definition of done, per lane

**Engine (P2)** — `evaluate()` returns a cell per criterion, each with a verdict, a
reason, and both citations. Vitest suite green, including a **polarity suite** proving
that for every exclusion criterion a matching fact yields FAIL and never PASS. Zero
imports from `fs`, `node-fetch`, or any database client.

**Compiler (P1)** — 300 trials fetched and cached; each eligibility block compiled to a
zod-valid `CriterionNode[]`; back-translation diff run with a *different* prompt than the
compiler; rejected and flagged trials counted and reported; every numeric leaf marked
`sweepable` with a range; the first 20 trees printed beside their source text for human
verification.

**App (P3)** — five routes rendering from fixtures with no network calls; every verdict
expandable to its two citations; the elasticity sweep precomputed, never computed on
drag; works at 400px width; amber used only for UNKNOWN.

**Data (P4)** — fixtures shipped in the first 45 minutes; ~50 Synthea patients; ~30
open-access PMC case reports with licences recorded; `data/prevalence.json` with ~20
cited biomarker prevalences; `data/eval/labels.json` with 20 patient-trial pairs labelled
**by hand before the engine runs**, including cases where an UNKNOWN triggers an action.

Never generate patient notes with an LLM and then feed them to the extractor. That is
circular and it invalidates the evaluation.

---

## 9. Data honesty

No real patient data, ever. Structured records from Synthea; narrative text from
open-access published case reports. The three demo patients are hand-built and we say so
on stage. Every prevalence figure carries a citation.

---

## 10. The eval lane (added 21:30 Fri)

`src/eval/` belongs to the compiler lane (Codex). It is the one place where a **read-only**
import of `@/src/engine` is explicitly permitted — import it, never edit it.

It exists because nobody otherwise owns comparing engine output to human judgement, and
that comparison is the metrics slide.

**What it does:** load `data/eval/labels.json`, run `evaluate()` over the referenced
patient-trial pairs, and report precision, recall, and UNKNOWN-agreement — how often the
engine says "can't tell" where the human said the same. Emit a PASS/FAIL/UNKNOWN
confusion matrix plus a named list of every disagreement with its criterion id and both
citations, so we can read our own failure modes aloud. Export JSON the app can render.

**Until `data/eval/labels.json` exists** (P4 and a human are writing it), build the harness
against `fixtures/cube.sample.json` treated as labels — same shape, known answers — so the
harness is finished and tested before the real labels land.

**The labels are written by a human, never by a model.** If a model labels them we are
grading the system against itself and the metrics mean nothing.

## 11. Open handoffs

- **Drug-class leaves** should compile to `in` with resolved `members`, not `==` with a
  bare `drugClass`. `==` only works against boolean-style facts. Compiler lane to fix for
  the 300-trial pool.
- **`matchAdhoc`** now exists alongside Gale-Shapley. Its `unstablePairs` count is exactly
  what stable matching removes — that is the comparison for the matching demo.

## 12. Claims lane (added 03:55 Sat)

`src/claims/**` and `data/claims/**` belong to the compiler lane (Codex), including
`data/claims/COHORT.md`. Raw DE-SynPUF downloads live in `data/claims/raw/` and are
gitignored — never committed.

## 13. The eval result is not presentable yet

The model-draft run returned precision 100%, recall 100%, UNKNOWN-agreement 100%, zero
disagreements. **That is not a result, it is a warning.** Two causes, both real: the draft
labels were produced by a model reasoning the same way the engine does, and 106 of 130
cells are UNKNOWN, so the matrix is dominated by one class.

Do not present 100% accuracy. Present the human-labelled blind subset instead, and report
the draft run only as "an independent model agreed on all 130 cells", which is a much
weaker and more honest claim.

## 14. Verify lane (added 09:40 Sat)

`src/verify/**` belongs to the engine lane (Claude Code) — pipeline checks, fidelity
rendering, and the preflight verify function. It may import `@/src/engine` read-only.
