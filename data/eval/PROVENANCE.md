# Eval label provenance

`labels.json` is a model draft. A model read the Synthea facts and the demo trial leaves and wrote all 130 rows. No person has reviewed them.

Every row has `labeller: "model-draft"` and `reviewedBy: null`. Those fields stay that way until a person checks the row and sets `reviewedBy` to their name.

Do not treat this file as hand-labelled ground truth.
