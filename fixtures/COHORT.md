# Lung cohort

These patients are synthetic. None of them is a real record. The prevalences they are compared with are the cited figures in `data/prevalence.json` (Huang et al., Pathol Oncol Res. 2021; Fois et al., Int J Mol Sci. 2021). A worklist that can be screened is the point of the file. It is not a claim that 150 consecutive clinic charts look like this.

The four hand-built demo charts stay in `fixtures/demo-patients.json` (PT-4410, PT-4411, PT-4412, PT-4413). They are not copied into this file. Loaders that want them pinned merge that file ahead of `fixtures/cohort.json`.

Seed 20260926. Evaluation date 2026-09-25. 150 patients: 60 academic centre (`LC-A-`), 90 community oncology (`LC-C-`).

## What the engine did on NCT02496663

Osimertinib and necitumumab, 27 leaves. Favourable means an inclusion passed or an exclusion cleared. The four EGFR mutation leaves are an OR: one match keeps the patient in, and the other four leaves still count as not met.

| Outcome on NCT02496663 | n | share |
|---|---:|---:|
| Not eliminated, 1 unknown | 22 | 14.7% |
| Not eliminated, 2 unknowns | 52 | 34.7% |
| Not eliminated, 3 or more unknowns | 45 | 30.0% |
| Eliminated | 31 | 20.7% |

The aim was about 15% fully worked up, 35% with one or two unknowns, 30% with several, and 20% eliminated on a real contradiction. The table above is the engine, not the aim.

A fully charted patient still has 1 unknown (EXC-3). EXC-3 asks for a washout in half-lives and EXC-1/EXC-2 ask for days. The engine keeps a single newest washout fact, so a day count that clears the surgery leaves cannot also answer the half-lives leaf. That cell stays UNKNOWN rather than being forced to a number that would eliminate the patient.

Top of the non-eliminated list, first row: LC-A-011 22/27 favourable, 1 unknown.

Elimination reasons as assigned when the chart was built (the engine is what marks the row eliminated):

- egfr-negative: 10
- no-tki: 6
- anc: 4
- ecog: 4
- crcl: 3
- bilirubin: 2
- ild: 2

On NCT06281964 (PLB1004, first-line, prior EGFR TKI is an exclusion), 150 of 150 are eliminated. That trial's two staging leaves demand different strings and the engine keeps one newest stage fact, so a recorded stage fails one of them. Patients with a stage on file are eliminated there even when the same chart is still open on NCT02496663.

## Completeness by site

Academic charts were aimed at fewer gaps than community charts. Missing below means no fact with that analyte (EGFR: no EGFR result other than a resistance co-mutation).

| Item | Academic missing | Community missing |
|---|---:|---:|
| EGFR result | 12/60 (20.0%) | 33/90 (36.7%) |
| ECOG | 0/60 (0.0%) | 0/90 (0.0%) |
| histology | 0/60 (0.0%) | 0/90 (0.0%) |
| stage | 0/60 (0.0%) | 0/90 (0.0%) |
| prior therapy | 1/60 (1.7%) | 10/90 (11.1%) |
| ANC | 9/60 (15.0%) | 20/90 (22.2%) |
| platelets | 10/60 (16.7%) | 12/90 (13.3%) |
| bilirubin | 6/60 (10.0%) | 19/90 (21.1%) |
| creatinine | 3/60 (5.0%) | 16/90 (17.8%) |
| creatinine clearance | 7/60 (11.7%) | 13/90 (14.4%) |
| albumin | 0/60 (0.0%) | 13/90 (14.4%) |

EGFR is absent on 45/150 (30.0%). The most-missed lab among ANC, platelets, bilirubin, creatinine, and albumin is missing on 29/150 (19.3%).

Missingness was aimed higher at community sites. It came out the other way for: platelets.

## EGFR against the cited figures

Huang et al. report EGFR mutation in 1,322/9,450 NSCLC specimens (13.99%). This file is built for two EGFR trials, so it is enriched. Among charts with an EGFR result, 95/105 (90.5%) are positive and 10/105 (9.5%) are an explicit negative. 45/150 (30.0%) were never tested. The positive share is not 13.99%.

Subtype share among EGFR-positive charts, against Fois et al. ranges (share of EGFR mutations, not of all NSCLC):

| Subtype | n | share of positives | cited |
|---|---:|---:|---|
| Exon 19 deletion | 50 | 52.6% | 45–60% |
| Exon 21 L858R | 39 | 41.1% | 35–45% |
| Exon 18 G719X | 2 | 2.1% | not given; remainder after the two common subtypes |
| Exon 21 L861Q | 2 | 2.1% | not given; remainder after the two common subtypes |
| EGFR Exon 20 insertion | 2 | 2.1% | not given; remainder after the two common subtypes |

T790M was drawn at 50% after a first-generation EGFR TKI (Fois et al., about 50% of those progressions). Produced: 44 T790M facts on 89 EGFR-positive charts that record erlotinib, gefitinib, or afatinib (49.4%).

## Other markers among charts that have a panel

A panel fact exists only when EGFR was tested. The engine reads the newest biomarker fact, which is the EGFR result, so these rows are in the file for the prevalence check and do not change the EGFR leaves. Draws are independent. KRAS was drawn once per panel and split into G12C versus other KRAS mutations. That is not mutual exclusivity with EGFR, and the cohort is EGFR-enriched, so these rates are not Huang's all-NSCLC rates.

| Marker | Produced | Cited |
|---|---:|---:|
| KRAS mutation, any | 30/105 (28.6%) | 28.87% |
| KRAS G12C | 14/105 (13.3%) | 11.82% |
| BRAF mutation | 5/105 (4.8%) | 4.23% |
| ALK rearrangement | 2/105 (1.9%) | 2.41% |
| ROS1 rearrangement | 0/105 (0.0%) | 0.67% |
| RET rearrangement | 2/105 (1.9%) | 0.67% |
| NTRK fusion | 0/105 (0.0%) | 0.16% |
| ERBB2 mutation | 3/105 (2.9%) | 1.71% |
| MET mutation | 4/105 (3.8%) | 2.38% |
| MET amplification | 4/105 (3.8%) | 2.71% |
| MET exon 14 skipping | 2/105 (1.9%) | 3.00% |
| PD-L1 TPS ≥ 50% | 25/105 (23.8%) | 30.53% |
| STK11 mutation | 7/105 (6.7%) | 12.29% |
| KEAP1 mutation | 6/105 (5.7%) | 5.92% |
| TMB ≥ 10 mutations/Mb | 36/105 (34.3%) | 36.65% |

MET exon 14 skipping was drawn at 3%, inside the Fois et al. range of 1–10%. The other cited percentages are Huang et al. point estimates (n = 9,450).

Off by 5 points or more on this draw: PD-L1 TPS ≥ 50% 23.8% vs 30.5%; STK11 mutation 6.7% vs 12.3%. ROS1 and NTRK can also land at zero in a panel of this size.

## Labs by site

Values are the ones in the file, among patients who have that analyte. Community sites were given a lower centre for ANC, platelets, creatinine clearance, and albumin, and more of them are missing. Units are the ones the facts carry.

**Absolute neutrophil count** (/mcL)

- Academic: n=51, median 4,910, IQR 3,770–6,355, min 1,420, max 7,950
- Community: n=70, median 3,905, IQR 3,210–5,178, min 890, max 8,460

**Platelets** (/mcL)

- Academic: n=50, median 264,000, IQR 219,000–294,000, min 134,000, max 427,000
- Community: n=78, median 210,500, IQR 163,000–252,250, min 110,000, max 422,000

**Total bilirubin** (× ULN)

- Academic: n=54, median 0.56, IQR 0.42–0.68, min 0.2, max 2.85
- Community: n=71, median 0.68, IQR 0.55–0.81, min 0.2, max 1.17

**creatinine** (mg/dL)

- Academic: n=57, median 0.91, IQR 0.68–1.07, min 0.4, max 1.45
- Community: n=74, median 0.86, IQR 0.68–1.01, min 0.4, max 1.43

**albumin** (g/dL)

- Academic: n=60, median 4, IQR 3.7–4.23, min 3.2, max 4.8
- Community: n=77, median 3.5, IQR 3.3–3.9, min 2.7, max 4.6

**Creatinine clearance** (mL/min)

- Academic: n=53, median 84, IQR 74–94, min 52, max 120
- Community: n=77, median 66, IQR 53–78, min 41, max 105

## Demographics produced

Sex: F 84, M 66.
Race: White 100, Asian 18, Black or African American 21, Other 10, American Indian or Alaska Native 1.
Age: median 67, IQR 61–72, min 42, max 88.

Race, sex, and age are not in `data/prevalence.json`. They are a seeded shape for an advanced NSCLC clinic, with more women among the EGFR-positive charts. Histology is the same: adenocarcinoma is heavier in the EGFR-positive charts. Neither is a cited row.
