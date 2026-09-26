# Devpost submission — draft

Edit before submitting. Every number marked `[CHECK]` must be replaced with a measured
value or deleted. Do not submit a number we have not run.

---

## Tagline

Trial screening that tells you what's missing, not whether you qualify.

---

## Inspiration

Fewer than 5% of adult cancer patients ever enrol in a clinical trial. The reason usually
isn't that they don't qualify — it's that nobody checked. Screening is still a human
reading a protocol next to a chart, one patient at a time. Large cancer centres staff for
it. Community hospitals, where most patients are actually treated, often have nobody doing
it at all.

We looked at the automated screeners that already exist and found they all answer the same
question: is this patient eligible, yes or no. But a chart usually can't answer that. If it
never mentions EGFR testing, that doesn't mean the patient is EGFR-negative — it means
nobody ordered the test. Systems that treat missing data as a failure quietly reject
qualified patients. Systems that treat it as a pass bury coordinators in false matches
until they stop using the tool.

So we built one that gives a third answer.

---

## What it does

AMBER compiles clinical trial eligibility criteria from free-text protocol prose into
typed, executable logic trees, then evaluates patients with three-valued logic:

- **PASS** — a fact satisfies the criterion and is recent enough to count
- **FAIL** — a fact contradicts it
- **UNKNOWN** — the record is silent, or the value is too old for the criterion's window

Unknowns eliminate nobody. They become ranked, priced work — which patient is closest to
enrollable, which single test unlocks them, and what that test costs. A reflex lab on tissue
pathology already holds outranks a blood draw, which outranks imaging, which outranks a new
biopsy, which outranks a washout period you can only wait out.

Because the scoring path contains no model inference, the same computation runs millions of
times. That turns a matching tool into a population engine, and five more products fall out
of one evaluation:

- **Criterion elasticity** — move a threshold, watch how many patients appear or vanish
- **Diversity Action Plan audit** — which criterion excludes which demographic group, which
  is exactly the justification FDORA 2022 now requires sponsors to produce
- **Market clearing** — when several trials at one site compete for the same patients,
  stable matching decides who goes where, using the algorithm behind the residency Match
- **Eligibility calendar** — who becomes eligible on which future date as washouts complete
- **Federated aggregation** — site-level curves with small-cell suppression, so criteria
  feasibility can be computed without patient data ever leaving a hospital

---

## How we built it

**Compiler.** Grok 4.7 turns each trial's eligibility prose into a typed logic tree with
nested AND/OR preserved. Output is validated against a frozen zod schema and rejected, never
coerced. Every leaf carries the verbatim protocol text it came from.

**Verification.** A second pass with a *different* model — Grok Build 0.1 — renders each
compiled tree back into English, diffed against the source. Divergence flags the trial for
human review. A trial compiles once and is verified once, then serves every patient forever,
so our LLM error surface is per-trial, not per-patient.

**Engine.** Deterministic TypeScript, three-valued Kleene logic, `[CHECK: N]` passing tests
including a polarity suite proving a fact matching an exclusion can never leave a patient
eligible. No model inference anywhere in the scoring path. Every eligibility decision is an
explicit comparison and exact date math, which means every result is reproducible and
auditable.

**The cube.** Patient × trial × criterion, each cell carrying a verdict, a reason, and two
citations — the trial's own words and the sentence from the patient record. Six read models
slice it.

**Data.** `[CHECK: 233]` real trials from the ClinicalTrials.gov API. 200 synthetic patients
from Synthea. Narrative text from 30 open-access PubMed Central case reports, licences
recorded. Real CMS Medicare claims from the DE-SynPUF public use file for the payer view.
No real patient data is used anywhere.

**Stack.** Next.js, TypeScript, Tailwind, zod, vitest. Built in Cursor.

---

## Challenges we ran into

**Recursive schemas.** Our criteria type is recursive — a group node contains children that
are also nodes, which is how nested AND/OR survives. xAI's structured outputs reject
self-referencing JSON schemas, so all 300 calls 400'd before the model ever ran. We fixed it
by expanding the recursion to a bounded depth rather than flattening the logic, because
flattening an OR would have silently changed what the criteria mean.

**Deciding what a verdict means.** Our first contract had a genuine contradiction: one
section implied verdicts were patient-oriented, another criterion-oriented. Our frontend
agent caught it before it reached the engine. We ruled that a verdict answers one question —
does this predicate describe this patient? — and polarity lives only in the elimination rule.
That kept `evaluate()` uniform and made Kleene composition work over nested groups without
special cases.

**Grading ourselves.** Our first evaluation labels were model-generated but tagged as
hand-written. We caught it, relabelled them `model-draft`, and built a blind labelling tool
so humans could produce real ground truth without ever seeing the system's answer. The
stratified subset weights toward the discriminating cases, because `[CHECK]` of the draft
labels were UNKNOWN and a confusion matrix dominated by one class measures nothing.

**A `NOT` that let sick patients through.** Negation was flipping both the verdict and the
criterion type, double-negating, and admitting patients with brain metastases through
`NOT(has brain metastases)`. Caught by the test suite before it reached a demo.

---

## Accomplishments we're proud of

We know our own prior art and we say it out loud. Trial Pathfinder (Stanford, *Nature* 2021)
showed relaxing criteria more than doubles the eligible pool. MatchMiner (Dana-Farber) is
open-source bidirectional matching. Dameron et al. formalised three-valued eligibility
reasoning in 2013. IBM holds a patent on cost-ranked test ordering. We build on all of it,
and we're specific about the three things we believe are ours: portfolio assignment across
competing trials, diversity-constrained matching against federally filed targets, and
matching-market theory applied to trial enrolment at all.

We also measured ourselves instead of claiming a number, and we can name where the system
fails.

---

## What we learned

That American health data is legally partitioned, and any system pretending otherwise is
either lying or breaking the law. Claims data can definitively rule a patient out — a drug
fill is proof — but almost never rule them in, because a claim shows a lab was billed and
never what it said. Charts rule patients in but only see one health system. Neither may
merge with the other at the row level.

Three-valued logic isn't a design preference. It's the honest representation of a system
where the data is federated by law.

---

## What's next

Reading real EHR data over FHIR with mCODE as the patient model. A document pipeline for
outside-lab NGS PDFs and pathology reports, which is where the hard data actually lives.
Event-triggered re-screening, because eligibility is a moving target — a patient ineligible
in March becomes eligible in September when progression opens second-line trials. And
validating the coverage figure against a real site's population rather than a synthetic one.

---

## Built with

`typescript` `nextjs` `react` `tailwindcss` `zod` `vitest` `grok` `xai-api` `cursor`
`clinicaltrials-gov-api` `synthea` `fhir` `cms-desynpuf` `notability`

---

## Submission checklist

- [ ] Every `[CHECK]` replaced with a measured number or deleted
- [ ] Public repo linked
- [ ] Demo video, 2–3 minutes
- [ ] Screenshots from `docs/shots/`
- [ ] Track selected (decide Sunday morning with information, not a guess)
- [ ] Sponsor challenges tagged: SpaceXAI, Impiricus, Notability
- [ ] Notability: note how we used it, with at least 2 screenshots
- [ ] Create-X interest box ticked
- [ ] Stated clearly that all patient data is synthetic
