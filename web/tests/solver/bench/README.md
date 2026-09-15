# Solver benchmark corpus

`corpus.json` keeps calibration and held-out cases in separate arrays. IDs,
source groups, and normalized puzzle strings are part of the review record;
cases must not move partitions without a new corpus hash.

The benchmark harness is a schema/dry-run harness. The required 5 cold/30 warm
trials, 4× CPU throttle, memory/transport/worker/cancellation matrix and raw
browser performance capture were not run in this environment. Defaults remain
the proposed, unvalidated 10-second / 70% human profile and rollout remains off.
