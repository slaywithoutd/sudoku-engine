# M2 solver benchmark record

_Historical record, kept as written on 2026-09-15. Branch and worktree names it mentions no longer exist; everything is on `master`._

Corpus: `web/tests/solver/bench/corpus.json`, schema 1. Calibration and held-out
partitions are disjoint by ID and source group. The committed harness validates
the partition/policy schema and performs a production-browser dry run.

Observed dry-run evidence: the benchmark Playwright schema/dry-run suite passed
when executed for T26. The required contract matrix (five cold and at least 30
warm trials on the foreground PC and 4× throttle, all policy/phase/rollout
ablations, peak memory, transport, worker and 100 cancellation cycles) was not
executed here. Therefore correctness/latency/resource defaults are not
validated by T26, and no defaults or frozen policy constants were changed.

Rollout remains disabled by default. Heavy family completion, cancellation
latency, heap ceilings and p50/p95 distributions remain unmeasured.
