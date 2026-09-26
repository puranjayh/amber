# Population

200 synthetic patients. None of these are real records.

`data/synthea/patients.json` keeps the first 50 patients and adds 150. The first 50 still have the facts written earlier. `travelMinutes` was filled in for them, and serum albumin, absolute neutrophil count, hemoglobin, platelets, and leukocytes were appended only where the August 2026 Synthea CSV already had a row that the first extract had left out. No lab value was edited.

The other 150 come from the public Synthea CSV of April 2020 (`synthea_sample_data_csv_apr2020.zip`, 1,171 patients). They are living, age 18 or older on 2026-09-25, and the source row had race, ethnicity, zip, latitude, and longitude. They were taken in patient-id order. They were not sorted by race or by lab value. 467 rows met those filters; the first 150 ids were used.

`travelMinutes` is the same function for every patient: great-circle miles from the record's latitude and longitude to 42.3626, -71.0689, divided by 30 mph, rounded to the nearest minute, and at least 1. It is not a measured drive time.

Race and ethnicity are the strings Synthea stored (`white`, `black`, `asian`, `native`; `hispanic`, `nonhispanic`).

## Headcount

| Race | n |
|---|---|
| white | 169 |
| black | 18 |
| asian | 12 |
| native | 1 |

Ethnicity: hispanic 32, nonhispanic 168.

## Absolute neutrophil count

LOINC 751-8, unit 10³/µL, most recent value on the patient. The April 2020 extract has no neutrophil count. The August 2026 extract has 13 rows in the whole file, and 2 of those fall in this cohort.

| Race | n | values |
|---|---|---|
| white | 2 | 2.0, 6.4 |
| black | 0 | |
| asian | 0 | |
| native | 0 | |

198 of 200 patients have no ANC. There is nothing to compare across groups, and two values in one group are not evidence of a gap or of its absence.

## Albumin

LOINC 1751-7, g/dL, most recent value. 35 of 200 patients have one.

| Race | n | median | IQR | min | max |
|---|---|---|---|---|---|
| white | 25 | 4.4 | 4.1–5.0 | 3.5 | 5.5 |
| black | 7 | 4.3 | 4.0–4.4 | 3.8 | 4.9 |
| asian | 3 | 4.4 | 4.2–4.95 | 4.0 | 5.5 |
| native | 0 | | | | |

The medians are 4.3 and 4.4. The black and white interquartile ranges overlap. There is no separation between the groups that have an albumin. Most of the cohort has no albumin at all, and the non-white counts are in the single digits.

## Creatinine clearance

Neither Synthea extract contains a creatinine-clearance observation. The count is 0 in every racial group. Serum creatinine and MDRD eGFR are different measurements and are not reported here as clearance.

Serum creatinine (LOINC 38483-4, mg/dL), which is on the patients under analyte `creatinine`, covers 84 of 200:

| Race | n | median | IQR | min | max |
|---|---|---|---|---|---|
| white | 69 | 1.00 | 0.80–2.50 | 0.40 | 11.50 |
| black | 10 | 1.25 | 1.03–2.60 | 0.70 | 6.10 |
| asian | 4 | 3.20 | 2.50–3.30 | 0.70 | 3.30 |
| native | 1 | 1.00 | | 1.00 | 1.00 |

The white and black interquartile ranges overlap; the medians differ by 0.25 mg/dL. The four asian values are 0.7, 3.1, 3.3, and 3.3, all inside the white range. That is not a gap between groups.
