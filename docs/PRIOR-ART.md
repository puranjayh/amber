# Prior art — say this before a judge does

This space is not empty. Naming it precisely is a strength: a judge who knows the field
will respect it, and one who doesn't will hear that we did the reading. **Never claim
novelty.** Claim integration plus three specific contributions.

## What exists

| Work | What it does | Where we differ |
|---|---|---|
| **Trial Pathfinder** — Stanford, *Nature* 2021, open source | Emulates completed NSCLC trials against 61,094 real patients; Shapley values attribute each criterion's effect on hazard ratio. Relaxing criteria more than doubled the eligible pool (1,553→3,209) while overall survival HR improved by 0.05. | Takes structured criteria as input, runs on a national database, has no individual-level missing-data model, assigns nobody to anything. It asks whether a criterion *should exist*, for a sponsor designing a trial. We ask who at *this site* can enrol and what to order tomorrow. |
| **MatchMiner** — Dana-Farber, *npj Precision Oncology* 2022, open source | Bidirectional matching, patient→trials and trial→patients, using CTML structured eligibility markup. | Optimises for classifying eligibility. Doesn't price unknowns, doesn't allocate across competing trials. We read its CTML spec before designing our schema. |
| **Dameron et al.** — *J Biomedical Semantics* 2013 | OWL model on the open-world assumption; three outcomes (eligible / ineligible / potentially eligible); explicitly critiques negation-as-failure for over-rejecting. | Identifies which information is missing but never ranks what to obtain next. Our three-valued logic is not new; pricing the unknowns is. |
| **US Patent 11,587,647** — IBM, filed 2019, granted 2023 | Cost vectors over enrollment criteria; ranks a candidate by "utilized cost". | Operates per candidate. We optimise the test-ordering set across a whole population. |
| **TriNetX / i2b2 / EHR4CR InSite** | Federated feasibility networks returning aggregate patient counts without moving row-level data. EHR4CR ran across 24 European hospitals, 14M records. | What flows over those networks is counts. We publish elasticity curves and subgroup exclusion profiles. |
| **ASCO–Friends analyses** — *Clin Cancer Res* 2021, NEJM Evidence | Applying broadened criteria to a 10,500-patient NSCLC cohort avoided excluding nearly half of it. | One-off retrospective studies on a handful of hand-picked criteria. We compute it automatically for every criterion in every compiled trial. |
| **JCO 2022, pancreatic** | 42% of Black patients ineligible vs 33% of white; albumin a leading driver. Lung: Black patients 1.6× more likely excluded on comorbidities. | Same — published as manual retrospective analysis, never as a live instrument. |
| **Lung-MAP umbrella allocation** | Patients eligible for multiple sub-studies randomised inversely to biomarker prevalence. | Sub-studies inside one protocol, pre-specified for statistical validity — not independent trials competing at a site. |

## What we believe is ours

Searched adversarially and found nothing:

1. **Portfolio assignment** — when several trials at one site compete for the same patients,
   who goes where. The problem is documented in site-feasibility literature; no solver found.
2. **Diversity-constrained matching** — maximising accrual subject to the enrolment targets
   FDORA 2022 requires sponsors to file. DAP tooling that exists is community engagement and
   monitoring dashboards, not criterion-level attribution.
3. **Matching-market theory applied to trial enrolment at all.** Deferred acceptance is
   Nobel-recognised (Roth & Shapley 2012) and runs the residency Match and school choice.
   Nothing found pointing it at patients and trials.

Weaker but still uncommon: batching unknown-resolution as set cover across a population, and
quantifying what fraction of eligibility criteria claims data can structurally answer.

## The sentence to use

> "Trial matching has been worked on for years — Trial Pathfinder in *Nature*, MatchMiner
> open-sourced at Dana-Farber, three-valued eligibility formalised back in 2013. Those
> systems optimise for classifying eligibility, which the chart usually can't answer. We
> optimise for the next action. And when five trials at one site compete for the same twelve
> patients, we clear the market with the algorithm that matches medical students to
> residencies. That last part we haven't seen anywhere."

## Verify before citing

Every figure above came from a search, not from a paper we read end to end. Before any of it
goes on a slide, open the source and confirm the number. One wrong citation in front of a
judge who knows the literature costs more than the slide is worth.
