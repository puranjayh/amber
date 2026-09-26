# HANDOFF

Things one lane noticed that another lane owns. Add a line and keep going
(docs/CONTRACT.md §5).

## From P2 (engine) — polarity: RESOLVED, engine complies

**Closed by the RULING in CONTRACT.md §4 (21:10 Friday).** Cell verdicts are
criterion-oriented; polarity lives only in the trial-level elimination rule. That
is what the engine already shipped, for the reason the ruling gives: it is the
only convention under which Kleene composition over nested groups needs no
special cases. An exclusion `OR(prior osimertinib, prior erlotinib)` means
"excluded if either", and a patient-oriented leaf verdict would turn that OR into
an AND by De Morgan and let a patient with one of the two drugs onto the trial.

The polarity suite now asserts both halves the ruling asks for — the exclusion
cell is **PASS** and the pair is **ELIMINATED** — plus the patient-facing
reading, so a future inversion fails whichever way someone reads it.

**P3:** `displayTone` in the ruling is right, and
`eligibilityVerdict(cell.verdict, leaf.type)` from `src/engine` is the same
function if you would rather import it than copy it — it is Kleene NOT, so
UNKNOWN stays UNKNOWN and amber keeps meaning only UNKNOWN. Either way you need
the leaf's `type`, which `CubeCell` does not carry: get it from
`indexLeaves(trial)`.

## From P2 (engine) — `drugClass` on a fact means two different things

**Who this is for:** P1 (compiler) and P4 (fixtures).

`fixtures/patients.sample.json` states therapy history as
`{ predicate: "prior_therapy", value: true, drugClass: "EGFR_TKI" }` — the class
names the question and the boolean is the answer. Published case reports state it
the other way, as a drug name with no class: `{ value: "pembrolizumab" }`.

The engine handles both, and the distinction matters:

- a fact that **declares** a class must match the leaf's class, exactly like an
  `analyte`, so a `PLATINUM` flag is never read as an answer about EGFR TKIs;
- a fact that declares **no** class is relevant to any drug-class leaf, and
  whether it falls inside the class is settled by comparison against the leaf's
  `members`.

Two consequences for the compiler: a drug-class leaf that uses `in` / `not_in`
**must** carry resolved `members`, or the engine has no list to test unclassed
drug names against and returns UNKNOWN / `unsupported`. And `EXC-1` in
`trials.sample.json` uses `operator: "=="` with `drugClass` and no `members`,
which only works against boolean-style facts — fine for the demo fixtures, but
real extracted records will carry drug names, so prefer `in` with `members` for
the 300-trial pool.

## From P2 (engine) — `age` criteria cite structured demographics

`Patient.age` is a record field, not a narrative sentence, so an `age` leaf
usually has no `Fact` to quote. Rather than report every age criterion as
UNKNOWN — which would bury the real unknowns — the engine cites the
demographics field and says so in the text:
`age 64 (structured demographics, PT-4417)`. It is not dressed up as a chart
quote. If P4 puts a real `age` fact in a fixture, that fact and its own
`sourceQuote` win.

## From P2 (engine) — `vitest` is in `package.json` scripts but was not installed

**Who this is for:** P1, who owns `package.json`.

`main` added `test` / `test:watch` scripts but no `vitest` devDependency, so
`npm test` fails on a fresh clone. The engine branch adds
`"vitest": "^3.2.7"` to `devDependencies`, plus the lockfile.

Please keep it at **3.x**. vitest 5 requires `@types/node` >= 22 and the repo
pins `^20`; npm refuses the install outright. Bumping `@types/node` instead would
touch every lane at once.

Also adds `vitest.config.ts` at the root — the `@/` alias mirroring tsconfig, so
tests import from `@/src/contracts` exactly as production code does. Move or
rename it freely; nothing in the engine depends on its location.

## From P2 (engine) — fixture conformance is wired up and passing

`src/engine/fixtures.test.ts` checks the engine against
`fixtures/cube.sample.json` cell by cell — verdict, reason, both citations,
`ageDays`, `observedAt`, and the whole roll-up — and re-asserts the three stories
in `fixtures/ORACLE.md`. It treats the fixture as an **oracle**, not a snapshot:
if the two disagree, one of us is wrong about the contract. Nobody should ever
regenerate the fixture to make it pass.

It self-skips while `fixtures/` is absent from the working tree, so no lane
blocks another, and it lights up by itself once P1 merges the fixtures to `main`.
Run it against an unmerged branch with
`AMBER_FIXTURES=/path/to/fixtures npm test`.

**Status: 52/52 green against `origin/eng/data` as of 21:20 Friday** — all 9
pairs, every cell, exact agreement including the staleness arithmetic. The hero
pair shows exactly 2 unknowns, the osimertinib pair is eliminated with
`failCount` 0, and PT-4408's out-of-window labs are UNKNOWN / `stale`.

## From P2 (engine) — three new read models, and what they need from you

`calendar`, `federate` and `planTestOrders`, all exported from `@/src/engine`.
None of them touches `src/contracts`, so the freeze is intact — their types live
in the engine lane. **If P3 renders any of them, P1 should lift the interfaces
into `src/contracts` before 00:00**, because the app is not supposed to import
from another lane. They are plain interfaces with no zod schemas; say the word
and I will write the schemas in the contract's own style.

### 1. Trial close dates — needed by the calendar (P1, compiler lane)

`Trial` has no enrollment-close field and is frozen, so `calendar()` takes them
as a lookup: `calendar(patients, trials, asOf, { closesOn: { NCT01234567: "2026-11-30" } })`.
Without it the calendar still works but declines to say whether a trial closes
before the patient becomes eligible — which is the interesting half.

The registry records the compiler already caches have this. Please emit a
`Record<nctId, string>` of ISO dates alongside the compiled trials. Prefer the
last date the trial is actually recruiting; if only a completion date is
available, use it and note that it is an upper bound.

### 2. A cost table — wanted by set cover (P4, data lane)

`planTestOrders` prices a budget in `TIER_WEIGHT` units (existing specimen 1,
blood draw 2, imaging 6, invasive 20). That is deliberate: inventing dollar
figures would make the screen-failure-dollars exhibit fiction. If you can get
cited list prices — CMS clinical lab fee schedule for the assays, OPPS for
imaging — send `Record<analyte, number>` with the citation per figure and I will
take a cost resolver, so the slide can say dollars with a source.

### 3. Prevalence priors change the plan (P4, data lane)

Set cover ranks by `pFavorable` from `data/prevalence.json`. Leaves without a
prior fall back to a 0.5 coin flip, and each plan reports `assumedPriors` so the
made-up share is visible. The more leaves you can prior, the less of that
estimate is invented. `objective: "pairs"` turns priors off entirely if it turns
out the coverage is too thin to steer on.

### 4. Reading the federated report (P3)

`SuppressedCount` is `number | "<11"`. Use the exported `isSuppressed()` type
guard rather than a `typeof` check, and render the marker string verbatim —
never as 0, never as "~10", never interpolated into a chart's y value. A
suppressed cell is a hole, and drawing it as a number defeats the point of the
layer.

`report.disclosureNotice` is a plain-language statement of what the suppression
does and does not protect. **Please put it on screen, not in a tooltip.** It says
this is cell suppression and not differential privacy, and that a fine-grained
elasticity curve can still localise an individual. If someone asks about privacy
on stage, that sentence is the honest answer and it is better read than
paraphrased.

Curves are per site and never pooled — the exhibit is that the same threshold
costs different sites different amounts, and pooling erases exactly that.

### 5. Where the calendar and set cover meet (P3)

They partition the same problem and the demo reads better if the UI says so. An
unknown is either **orderable** (tiers 0–3 — set cover buys it) or **time-bound**
(tier 4 — only the calendar can date it). `planTestOrders` reports
`pairsBlockedByTime` for pairs it cannot help; those are exactly the pairs
`calendar()` has a date for. "Three of these you can buy today, two you can only
wait for, and here is when" is one sentence and two function calls.
