# Compiler status

- Task 1 — blocked: DE-SynPUF ingestion conflicts with CONTRACT §1 ownership (`src/claims/**` and `data/claims/**`); handoff added to `docs/HANDOFF.md`.
- Task 2 — blocked: `data/claims/COHORT.md` is P4-owned; the required scope and limitations are in `docs/HANDOFF.md`.
- Task 3 — done: model-draft evaluation ran over 130 cells (precision 100%, recall 100%, UNKNOWN agreement 100%, no disagreements); generated results are handed to P4 for data-lane commit.
- Task 4 — done: added `src/eval/ingest-human.ts`; one command validates a human JSON label array, preserves human provenance, writes `labels.human.json`, and emits a separate human results report.
- Task 5 — done/blocked: analyzed all 67 failures in `docs/REJECTIONS.md`; fixed non-numeric sweep hints and prepared exact-ID retries, but did not run them because `XAI_API_KEY` is unavailable and 46 failures are xAI credit-limit responses.
- Review severity — done: `validate.ts` reports citation-granularity and semantic flags separately; `data/compiled/review-queue.json` contains the 37 semantic OR-structure reviews with source text and trees.
