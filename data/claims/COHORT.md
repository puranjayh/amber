# DE-SynPUF Sample 1 lung-cancer cohort

Generated from CMS 2008–2010 Data Entrepreneurs' Synthetic Public Use File (DE-SynPUF), Sample 1. The cohort includes beneficiaries with at least one inpatient claim carrying an ICD-9 162.x diagnosis code. Raw downloads are intentionally excluded from git.

## Cohort

- Beneficiaries: 1296
- Lung-cancer inpatient claims: 1327
- Part B mapped chemotherapy administrations (carrier and outpatient): 114
- Beneficiaries with Part B platinum administration: 80
- Beneficiaries with Part B taxane administration: 7
- Beneficiaries with Part B checkpoint-immunotherapy administration: 0
- Beneficiaries with Part D oral EGFR-TKI fill: 0
- PDE rows in cohort not mapped to erlotinib/gefitinib by openFDA: 78489

Part B HCPCS J-codes identify infused administrations: J9045 carboplatin, J9060 cisplatin, J9305 pemetrexed, J9171 docetaxel, and the checkpoint-inhibitor codes J9022 atezolizumab, J9173 durvalumab, J9228 ipilimumab, J9271 pembrolizumab, and J9299 nivolumab. Oral erlotinib/gefitinib NDCs are resolved from the openFDA NDC Directory at batch time. Any NDC or HCPCS code outside those exact mappings is not silently treated as anticancer therapy.

No checkpoint-immunotherapy administration appears in this 2008–2010 sample. That is consistent with the era: the mapped checkpoint agents entered lung-cancer care after this claims window, so zero is not evidence that a beneficiary was clinically ineligible for immunotherapy.
The 0 mapped oral EGFR-TKI beneficiaries reflect the 2008–2010 era and this synthetic Sample 1 subset. Targeted therapy was much less prevalent than later eras; this is not evidence that an individual had no targeted treatment.

## Race distribution

| Race | Beneficiaries | Share |
| --- | ---: | ---: |
| Black | 142 | 11.0% |
| Hispanic | 33 | 2.5% |
| Other | 40 | 3.1% |
| White | 1081 | 83.4% |

## State distribution

State codes are the original DE-SynPUF beneficiary summary values, retained as geography rather than patient addresses.

| State code | Beneficiaries | Share |
| --- | ---: | ---: |
| 01 | 23 | 1.8% |
| 02 | 2 | 0.2% |
| 03 | 17 | 1.3% |
| 04 | 20 | 1.5% |
| 05 | 96 | 7.4% |
| 06 | 9 | 0.7% |
| 07 | 17 | 1.3% |
| 08 | 3 | 0.2% |
| 09 | 2 | 0.2% |
| 10 | 82 | 6.3% |
| 11 | 28 | 2.2% |
| 12 | 6 | 0.5% |
| 13 | 7 | 0.5% |
| 14 | 65 | 5.0% |
| 15 | 33 | 2.5% |
| 16 | 19 | 1.5% |
| 17 | 16 | 1.2% |
| 18 | 28 | 2.2% |
| 19 | 24 | 1.9% |
| 20 | 11 | 0.8% |
| 21 | 30 | 2.3% |
| 22 | 33 | 2.5% |
| 23 | 54 | 4.2% |
| 24 | 24 | 1.9% |
| 25 | 17 | 1.3% |
| 26 | 23 | 1.8% |
| 27 | 2 | 0.2% |
| 28 | 12 | 0.9% |
| 29 | 3 | 0.2% |
| 30 | 3 | 0.2% |
| 31 | 44 | 3.4% |
| 32 | 5 | 0.4% |
| 33 | 72 | 5.6% |
| 34 | 41 | 3.2% |
| 35 | 4 | 0.3% |
| 36 | 60 | 4.6% |
| 37 | 17 | 1.3% |
| 38 | 8 | 0.6% |
| 39 | 65 | 5.0% |
| 41 | 4 | 0.3% |
| 42 | 25 | 1.9% |
| 43 | 2 | 0.2% |
| 44 | 32 | 2.5% |
| 45 | 74 | 5.7% |
| 46 | 8 | 0.6% |
| 47 | 4 | 0.3% |
| 49 | 42 | 3.2% |
| 50 | 34 | 2.6% |
| 51 | 12 | 0.9% |
| 52 | 23 | 1.8% |
| 53 | 4 | 0.3% |
| 54 | 7 | 0.5% |

## What claims structurally cannot tell us

- **No lab values:** this ingest creates no laboratory facts. Claims cannot establish ANC, creatinine clearance, bilirubin, QTc, biomarker status, or a negative test result.
- **Clinical detail is incomplete:** a diagnosis or fill records billing evidence, not staging, ECOG status, disease progression, treatment intent, response, or protocol-specific eligibility.
- **Travel is only a proxy:** travelMinutes is a transparent function of state and county codes, not observed driving time, address, or site selection.
- **Synthetic and historical:** DE-SynPUF covers 2008–2010, uses ICD-9 rather than ICD-10, and CMS deliberately reduced longitudinal coherence during synthesis. It is a safe demonstration corpus, not a clinical population estimate.
- **Sample integrity over coverage:** the current CMS 2010 beneficiary-summary link resolves to Sample 20. This Sample 1 ingest therefore uses the available 2008–09 Sample 1 beneficiary summaries with the 2008–10 Sample 1 inpatient and PDE files; it does not mix in Sample 20 records.
