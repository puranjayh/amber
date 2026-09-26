# Compiler status

- Task 1 — done: ingested DE-SynPUF Sample 1 lung-cancer cohort into `data/claims/patients.json`; all facts carry claims provenance and verbatim source lines, with no fabricated labs.
- Task 2 — done: wrote `data/claims/COHORT.md`, including demographic distributions, mapped-therapy counts, synthetic-data limits, and the CMS Sample-20 link caveat.
- Task 3 — done: model-draft evaluation ran over 130 cells (precision 100%, recall 100%, UNKNOWN agreement 100%, no disagreements); generated results are handed to P4 for data-lane commit.
- Task 4 — done: added `src/eval/ingest-human.ts`; one command validates a human JSON label array, preserves human provenance, writes `labels.human.json`, and emits a separate human results report.
- Task 5 — done/blocked: analyzed all 67 failures in `docs/REJECTIONS.md`; exact-ID retries are prepared but not run because `XAI_API_KEY` is absent and xAI credits are exhausted.
- Corpus safety — done: compiler and backtranslation write to a temporary file, validate its tree count against the existing corpus, then atomically swap only if the new run is no worse. API work is prepared but not run while keys/credits are unavailable.
- Review severity — done: citation-granularity flags now live in `citationFlags` and do not gate the demo; semantic/backtranslation flags do. The restored 233-tree corpus has 133 citation-only demo candidates and 100 semantic review-queue entries.
