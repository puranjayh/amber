# Compilation rejection analysis

Source: `data/compiled/trials.json`, 300-trial batch captured before the current
boundary fixes. A trial counts once, using its primary failure reason; counts sum to 67.

| Failure reason | Trials | Recoverable now? | Treatment |
| --- | ---: | --- | --- |
| xAI monthly spending/credit limit (HTTP 403) | 46 | Blocked externally | Retry only after xAI credits are restored. |
| Non-numeric leaf emitted sweep metadata | 16 | Yes | Compiler now drops all sweep fields and marks the leaf `sweepable: false`. |
| Drug-class leaf omitted concrete members or used the wrong operator | 4 | Yes | Current prompt requires `in` plus resolved members; validation retains the safety gate. |
| Leaf type disagreed with the source block | 1 | Yes | Current prompt explicitly requires each leaf to match its inclusion/exclusion block. |

The 21 validation failures are safe to target once an xAI key is available. The compiler
now accepts `--nct-ids <json-file>` and refuses to run anything outside that exact list:

```sh
npx tsx src/compiler/compile.ts data/raw/clinicaltrials-lung-cancer-recruiting.json \
  data/compiled/trials.retry.json --nct-ids src/compiler/retry-recoverable-nctids.json
```

Do not present the 46 quota failures as a clinical or model-quality finding. They are an
external budget interruption. The underlying source cache is complete, and no patient
or trial content was dropped to work around the limit.

## Morning action

`XAI_API_KEY` was unavailable during this run, so no retry was attempted. Create the
committed 21-ID retry list, then run the exact bounded command after credits are restored;
leave the 46 quota-only trials for a separate retry.
