# Insurance records for the physician day

The dataset is the **CMS 2008–2010 Data Entrepreneurs’ Synthetic Public Use File (DE-SynPUF), sample 1**.

It is synthetic Medicare claims, generated from a real 5% Medicare sample and released by CMS for public use. It is the nationally recognized file people use when they need claim-shaped records without a data-use agreement. It is not a live payer feed, and it is not a chart.

https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-claims-synthetic-public-use-files/cms-2008-2010-data-entrepreneurs-synthetic-public-use-file-de-synpuf

Files used, all sample 1:

- 2008 and 2009 beneficiary summary (enrollment, date of birth, sex, race)
- 2008–2010 inpatient and outpatient claims (ICD-9)
- 2008–2010 carrier claims, segment A (the physician NPI and the service date)
- 2008–2010 Part D events (NDC)

The zips live in `data/claims/source/` and are gitignored. `build_panel.py` writes the 20-patient extract. `score.ts` runs `evaluate()` and writes `app/_data/clinic.json`.

What a claim is allowed to decide is already the engine’s rule: a dispense or a coded diagnosis can count; a lab, a biomarker, a stage, and a performance status cannot be confirmed from a bill. This extract does not invent those results.

Commercial claims (MarketScan, Optum, Komodo) are licensed and are not in this repo. Real Medicare research files need a DUA. DE-SynPUF is the file that can ship tonight.
