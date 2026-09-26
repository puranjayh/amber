#!/usr/bin/env python3
"""Build one physician's day from CMS DE-SynPUF sample 1.

Reads the zips in data/claims/source/ (not committed) and writes
data/claims/panel.json: 20 synthetic beneficiaries who share a performing NPI
and a service date on a carrier claim, plus the claim lines that mention them.

Facts are only what a claim can actually say. A lung-cancer ICD is kept as a
claim line for the doctor to read. It is not written as a confirmed NSCLC
diagnosis, because the code is not histology. An age comes from the enrollment
file. An ILD code is a comorbidity, because that code is the diagnosis.
"""

from __future__ import annotations

import csv
import json
import zipfile
from collections import defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "source"
OUT = ROOT / "panel.json"

LUNG = {"1620", "1622", "1623", "1624", "1625", "1628", "1629"}
ILD = {"515", "5160", "5161", "5162", "5163", "5168", "5169"}

ICD_LABEL = {
    "1620": "malignant neoplasm of trachea",
    "1622": "malignant neoplasm of main bronchus",
    "1623": "malignant neoplasm of upper lobe, bronchus or lung",
    "1624": "malignant neoplasm of middle lobe, bronchus or lung",
    "1625": "malignant neoplasm of lower lobe, bronchus or lung",
    "1628": "malignant neoplasm of other parts of bronchus or lung",
    "1629": "malignant neoplasm of bronchus and lung, unspecified",
    "515": "postinflammatory pulmonary fibrosis",
    "5160": "pulmonary alveolar proteinosis",
    "5161": "idiopathic pulmonary hemosiderosis",
    "5162": "pulmonary alveolar microlithiasis",
    "5163": "idiopathic interstitial pneumonia",
    "5168": "other alveolar and parietoalveolar pneumonopathies",
    "5169": "unspecified alveolar and parietoalveolar pneumonopathy",
}

# 11-digit NDCs. SynPUF Part D uses PROD_SRVC_ID. Osimertinib is absent from
# 2008–2010; erlotinib and gefitinib are the EGFR TKIs of that period.
DRUGS = {
    "50242006201": "erlotinib 25 mg",
    "50242006301": "erlotinib 100 mg",
    "50242006401": "erlotinib 150 mg",
    "00310048230": "gefitinib 250 mg",
    "0310048230": "gefitinib 250 mg",
}

RACE = {
    "1": "White",
    "2": "Black or African American",
    "3": "Other",
    "4": "Asian",
    "5": "Hispanic",
    "6": "American Indian or Alaska Native",
}
SEX = {"1": "M", "2": "F"}

PANEL = 20


def open_csv(zip_name: str):
    path = SOURCE / zip_name
    zf = zipfile.ZipFile(path)
    name = zf.namelist()[0]
    fh = zf.open(name)
    text = (line.decode("utf-8", "replace") for line in fh)
    reader = csv.DictReader(text)
    return zf, reader


def norm_code(value: str | None) -> str:
    if not value:
        return ""
    return value.strip().replace(".", "").upper()


def iso(yyyymmdd: str) -> str | None:
    if not yyyymmdd or len(yyyymmdd) != 8 or not yyyymmdd.isdigit():
        return None
    try:
        return datetime.strptime(yyyymmdd, "%Y%m%d").date().isoformat()
    except ValueError:
        return None


def age_on(birth: str, day: str) -> int | None:
    b, d = iso(birth), iso(day) if len(day) == 8 else day
    if b is None or d is None:
        return None
    bd, dd = datetime.fromisoformat(b).date(), datetime.fromisoformat(d).date()
    years = dd.year - bd.year - ((dd.month, dd.day) < (bd.month, bd.day))
    return years if years >= 0 else None


def icd_fields(row: dict, prefix: str, n: int) -> list[str]:
    out = []
    for i in range(1, n + 1):
        code = norm_code(row.get(f"{prefix}{i}"))
        if code:
            out.append(code)
    return out


def main() -> None:
    print("scanning diagnoses for lung cancer and ILD")
    lung_ids: set[str] = set()
    lung_lines: dict[str, dict] = {}
    ild_lines: dict[str, dict] = {}

    def note_codes(bene: str, codes: list[str], when: str | None, doc: str, claim: str) -> None:
        for code in codes:
            if code in LUNG:
                lung_ids.add(bene)
                current = lung_lines.get(bene)
                # Keep the earliest code so a 2010 claim cannot explain a 2008 visit.
                if current is None or (
                    when is not None and (current["date"] is None or when < current["date"])
                ):
                    lung_lines[bene] = {
                        "code": code,
                        "label": ICD_LABEL.get(code, f"ICD-9 {code}"),
                        "date": when,
                        "doc": doc,
                        "claim": claim,
                    }
            if code in ILD and bene not in ild_lines:
                ild_lines[bene] = {
                    "code": code,
                    "label": ICD_LABEL.get(code, f"ICD-9 {code}"),
                    "date": when,
                    "doc": doc,
                    "claim": claim,
                }

    zf, rows = open_csv("inpatient.zip")
    try:
        for row in rows:
            note_codes(
                row["DESYNPUF_ID"],
                icd_fields(row, "ICD9_DGNS_CD_", 10) + [norm_code(row.get("ADMTNG_ICD9_DGNS_CD"))],
                iso(row.get("CLM_FROM_DT", "")),
                "DE1_0_2008_to_2010_Inpatient_Claims_Sample_1",
                row.get("CLM_ID", ""),
            )
    finally:
        zf.close()

    zf, rows = open_csv("outpatient.zip")
    try:
        for row in rows:
            note_codes(
                row["DESYNPUF_ID"],
                icd_fields(row, "ICD9_DGNS_CD_", 10),
                iso(row.get("CLM_FROM_DT", "")),
                "DE1_0_2008_to_2010_Outpatient_Claims_Sample_1",
                row.get("CLM_ID", ""),
            )
    finally:
        zf.close()

    print(f"lung beneficiaries so far {len(lung_ids)}")

    # Days are marked when a lung-cancer beneficiary has a carrier line.
    # Patient lists are filled on the second pass so file order cannot drop
    # someone who was billed earlier the same day.
    candidate_days: set[tuple[str, str]] = set()

    zf, rows = open_csv("carrier1a.zip")
    try:
        for row in rows:
            npi = (row.get("PRF_PHYSN_NPI_1") or "").strip()
            day = (row.get("CLM_FROM_DT") or "").strip()
            bene = row["DESYNPUF_ID"]
            if len(npi) != 10 or not npi.isdigit() or npi == "0000000000":
                continue
            if not iso(day):
                continue
            codes = icd_fields(row, "ICD9_DGNS_CD_", 8)
            note_codes(
                bene,
                codes,
                iso(day),
                "DE1_0_2008_to_2010_Carrier_Claims_Sample_1A",
                row.get("CLM_ID", ""),
            )
            if bene in lung_ids or any(c in LUNG for c in codes):
                candidate_days.add((npi, day))
    finally:
        zf.close()
    print(f"candidate physician-days {len(candidate_days)}")
    panels = defaultdict(set)
    day_dx = defaultdict(list)
    zf, rows = open_csv("carrier1a.zip")
    try:
        for row in rows:
            npi = (row.get("PRF_PHYSN_NPI_1") or "").strip()
            day = (row.get("CLM_FROM_DT") or "").strip()
            if (npi, day) not in candidate_days:
                continue
            bene = row["DESYNPUF_ID"]
            panels[(npi, day)].add(bene)
            codes = icd_fields(row, "ICD9_DGNS_CD_", 8)
            bucket = day_dx[(npi, day, bene)]
            for code in codes:
                if code not in bucket and len(bucket) < 6:
                    bucket.append(code)
    finally:
        zf.close()

    # A day the blast is for: about 20 people billed, a handful with a lung-cancer
    # code somewhere in the sample. Maximising lung codes picks a synthetic
    # high-volume NPI whose panel is half cancer and does not look like a clinic.
    def lung_by(bene: str, day: str) -> bool:
        line = lung_lines.get(bene)
        if line is None or line["date"] is None:
            return False
        when = iso(day)
        return when is not None and line["date"] <= when

    def day_key(item: tuple[tuple[str, str], set[str]]) -> tuple:
        (npi, day), ids = item
        lung = sum(1 for bene in ids if lung_by(bene, day))
        size = len(ids)
        in_band = 15 <= size <= 28 and 3 <= lung <= 5
        return (
            0 if in_band else 1,
            abs(lung - 3) if in_band else -lung,
            abs(size - PANEL),
            day,
            npi,
        )

    ranked = sorted(panels.items(), key=day_key)
    if not ranked:
        raise SystemExit("no physician-day with a lung-cancer claim in carrier sample 1A")

    print("top days:")
    for (npi, day), ids in ranked[:8]:
        print(f"  {npi} {iso(day)} patients={len(ids)} lung={sum(1 for b in ids if lung_by(b, day))}")

    (npi, day), ids = ranked[0]
    lung_first = sorted(b for b in ids if lung_by(b, day))
    rest = sorted(b for b in ids if not lung_by(b, day))
    # Lung patients are kept first if the day is larger than the panel. Clock
    # order is then by id, so the ranking is not disguised as the morning schedule.
    chosen = sorted((lung_first + rest)[:PANEL])
    chosen_set = set(chosen)
    as_of = iso(day)
    assert as_of is not None

    print(f"selected NPI {npi} date {as_of} keeping {len(chosen)}")

    benes: dict[str, dict] = {}
    for zip_name, year in (
        ("bene2008.zip", "2008"),
        ("bene2009.zip", "2009"),
    ):
        zf, rows = open_csv(zip_name)
        try:
            for row in rows:
                if row["DESYNPUF_ID"] in chosen_set:
                    benes.setdefault(row["DESYNPUF_ID"], {})[year] = row
        finally:
            zf.close()

    fills: dict[str, list[dict]] = defaultdict(list)
    zf, rows = open_csv("pde.zip")
    try:
        for row in rows:
            bene = row["DESYNPUF_ID"]
            if bene not in chosen_set:
                continue
            when = iso(row.get("SRVC_DT", ""))
            if when is None or when > as_of:
                continue
            ndc = norm_code(row.get("PROD_SRVC_ID"))
            fills[bene].append(
                {
                    "date": when,
                    "ndc": ndc,
                    "drug": DRUGS.get(ndc),
                    "daysSupply": row.get("DAYS_SUPLY_NUM", ""),
                    "doc": "DE1_0_2008_to_2010_Prescription_Drug_Events_Sample_1",
                    "claim": row.get("PDE_ID", ""),
                }
            )
    finally:
        zf.close()

    patients = []
    schedule = []
    for index, bene in enumerate(chosen):
        year = "2009" if as_of >= "2009-01-01" and "2009" in benes.get(bene, {}) else "2008"
        row = benes.get(bene, {}).get(year) or benes.get(bene, {}).get("2008") or benes.get(bene, {}).get("2009")
        if row is None:
            print("skip, no enrollment row", bene)
            continue
        death = iso(row.get("BENE_DEATH_DT", ""))
        if death is not None and death <= as_of:
            print("skip, died", bene, death)
            continue
        years = age_on(row["BENE_BIRTH_DT"], day)
        if years is None:
            continue
        sex = SEX.get(row.get("BENE_SEX_IDENT_CD", ""), "unknown")
        race = RACE.get(row.get("BENE_RACE_CD", ""), "Unknown")
        summary_doc = (
            "DE1_0_2009_Beneficiary_Summary_File_Sample_1"
            if year == "2009"
            else "DE1_0_2008_Beneficiary_Summary_File_Sample_1"
        )
        facts = [
            {
                "predicate": "age",
                "value": years,
                "unit": "years",
                "observedAt": as_of,
                "sourceQuote": (
                    f"BENE_BIRTH_DT {row['BENE_BIRTH_DT']} on {summary_doc}. "
                    f"Age on {as_of} is {years}."
                ),
                "sourceDoc": summary_doc,
                "provenance": "claims",
            }
        ]
        ild = ild_lines.get(bene)
        if ild and (ild["date"] is None or ild["date"] <= as_of):
            facts.append(
                {
                    "predicate": "comorbidity",
                    "analyte": "ILD",
                    "value": True,
                    "observedAt": ild["date"] or as_of,
                    "sourceQuote": (
                        f"ICD-9 {ild['code']} {ild['label']} on claim {ild['claim']} "
                        f"dated {ild['date']} in {ild['doc']}."
                    ),
                    "sourceDoc": ild["doc"],
                    "provenance": "claims",
                }
            )

        claim_lines = []
        for code in day_dx.get((npi, day, bene), []):
            claim_lines.append(
                {
                    "kind": "diagnosis",
                    "code": code,
                    "label": ICD_LABEL.get(code, "coded on today's carrier claim"),
                    "date": as_of,
                    "doc": "DE1_0_2008_to_2010_Carrier_Claims_Sample_1A",
                    "lung": code in LUNG,
                }
            )
        # The code that put them in the lung set, when it is not already on today's line.
        prior = lung_lines.get(bene)
        if prior and prior.get("date") and prior["date"] <= as_of and not any(line["lung"] for line in claim_lines):
            claim_lines.append(
                {
                    "kind": "diagnosis",
                    "code": prior["code"],
                    "label": prior["label"],
                    "date": prior["date"] or as_of,
                    "doc": prior["doc"],
                    "lung": True,
                }
            )
        recent = sorted(fills.get(bene, []), key=lambda f: f["date"], reverse=True)[:4]
        for fill in recent:
            claim_lines.append(
                {
                    "kind": "dispense",
                    "code": fill["ndc"],
                    "label": fill["drug"] or f"Part D product {fill['ndc']}",
                    "date": fill["date"],
                    "doc": fill["doc"],
                    "lung": False,
                    "knownDrug": fill["drug"],
                }
            )

        hour = 8 + (index * 20) // 60
        minute = (index * 20) % 60
        patients.append(
            {
                "id": bene,
                "age": years,
                "sex": sex,
                "race": race,
                "facts": facts,
            }
        )
        schedule.append(
            {
                "patientId": bene,
                "time": f"{hour:02d}:{minute:02d}",
                "timeNote": "Sequence on this date. The claim has a service date and no clock time.",
                "lungCancerClaim": lung_by(bene, day),
                "claimLines": claim_lines,
            }
        )

    panel = {
        "source": {
            "name": "CMS DE-SynPUF",
            "sample": "DE1.0 sample 1",
            "url": "https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-claims-synthetic-public-use-files/cms-2008-2010-data-entrepreneurs-synthetic-public-use-file-de-synpuf",
            "note": (
                "Synthetic Medicare claims built from a real 2008–2010 5% sample. "
                "Not a live payer feed, and not a medical record. "
                "Carrier sample 1A only; sample 1B was not required for this day."
            ),
        },
        "doctor": {
            "npi": npi,
            "serviceDate": as_of,
            "pickedBecause": (
                "Performing NPI and service date on carrier claims, chosen deterministically: "
                "a day with 15 to 28 beneficiaries and 3 to 5 of them carrying a lung-cancer ICD "
                "somewhere in sample 1, then the count closest to 3, then the size closest to 20, "
                "then the earliest date, then the NPI. "
                "SynPUF has no appointment book, so this is who billed under that NPI that day."
            ),
        },
        "blast": {
            "nctId": "NCT07001001",
            "text": "Johnson & Johnson just announced a trial for their new drug. Check to see if your patients fit their criteria.",
        },
        "patients": patients,
        "schedule": schedule,
    }
    OUT.write_text(json.dumps(panel, indent=2) + "\n")
    print(f"wrote {OUT} patients={len(patients)} lung={sum(1 for s in schedule if s['lungCancerClaim'])}")


if __name__ == "__main__":
    main()
