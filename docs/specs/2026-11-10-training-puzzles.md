# Training puzzles: timed next-digit positions — proposal

Status: **approved 2026-11-13 under [D106](../decisions.md)** by the implementing agent on the user's delegation; every §7 question takes its recommended answer (§7). **Merged** on 2026-11-13: T1–T6 ([verification](../history/train-verification.md)). Drafted 2026-11-10 from a user idea of the same day: "a puzzle as in chess: a half-filled Sudoku position, a timer, place the next number as fast as possible, with streaks and a history of best times".

Related: [M2.6 engine hardening](2026-09-22-m26-engine-hardening.md) (D103), [technique selection and a single Solve view](2026-10-22-technique-selection-and-solve-views.md), [roadmap](../roadmap.md) (M6 gameplay hints), [parked ideas](../ideas.md) §2, [decisions](../decisions.md) D055, D094, D101.

## 1. Objective

A fourth activity next to Play, Create and Solve. The app shows a partly solved classic 9×9 position and starts a clock; the player places one correct digit; the app records the time, keeps a streak of consecutive correct answers and shows personal bests.

The engine is what makes this more than a stopwatch on a random grid: a position is taken from a checked Explain trace, so the app knows which technique the position needs and can say so after the answer.

Not in this proposal: accounts, shared leaderboards, ratings, daily sets, variant positions, hints during an attempt (§8 and [ideas](../ideas.md) §2).

## 2. The design problem and the answer to it

A chess puzzle has one best move. A Sudoku position has a correct digit for every empty cell, so "place the next number" needs a definition of which placements are fair to ask for and how hard the position is.

Explain serves a technique only when every simpler tier has nothing left (`scheduling/select.ts:460-465`, `ledger.ts:143`; under `explain-fair@3` this stays strict for tiers 0–2, and a step taken past a capped simpler job is flagged `budgetLimited`). So the state just before an accepted, non-`budgetLimited` step of tier *t* is a position where no step of a lower tier exists inside the profile. That gives a difficulty label that is a property of the position, not an estimate.

Two kinds of position follow.

| Kind | What the player sees | Why it is fair | Label |
| --- | --- | --- | --- |
| **Scan** | Givens and placed digits only, no notes. | At least one cell is a naked or hidden single from the placed digits alone (candidates recomputed from rows, columns and boxes, without any earlier elimination). | `scan` |
| **Technique** | Givens, placed digits, and the engine's candidates before the key step, shown as notes. | No single exists in the shown candidates. The key step (tier ≥ 1) removes candidates and at least one single appears. Without the notes the player would have to redo every earlier elimination, which is a different and much slower task. | tier and technique id of the key step |

The notes are required for the second kind because the step event's `candidates` are the engine's state after all earlier eliminations (`classic-run.ts`, `ClassicSolveEvent` `step`: "candidate bitmasks before the step").

## 3. Findings in the code (2026-11-10, `master` at `f07fc20`)

| Finding | Where | Consequence |
| --- | --- | --- |
| A step event carries `technique`, `name`, `effects` (`place` / `remove`), `values`, `candidates` before the step and the pattern `cells`. | `web/src/solver/classic-run.ts:50-66`, `proof/types.ts:28` | A position and its explanation can be built from the trace alone. |
| On `feat/m26-hardening` the step also carries `budgetLimited`, and the logical phase is cut by work units. | `git show feat/m26-hardening:web/src/solver/classic-run.ts` | The "no simpler step" label and a reproducible harvest need M2.6. |
| Techniques have tiers 0–6. | `web/src/solver/techniques/manifest.ts` | Categories for statistics come from the catalogue, not from a new scale. |
| The play clock counts only active time and drops sleep gaps. | `web/src/app/play-clock.ts` | Reused as is. |
| The play screen already covers the board while paused. | `web/src/ui/player.ts:120` (`pause-cover`) | The same cover prevents thinking with the clock stopped. |
| The whole library is one IndexedDB record, rewritten on every commit; `LibraryData.formatVersion` is 2 and the backup `version` is 2 (3 for both since M2.7, D105). | `web/src/storage/repository.ts`, `web/src/domain/model.ts:157`, `web/src/domain/backup.ts:22` | Attempt history must be bounded, or it needs its own object store (§5.4). |
| There is no production puzzle generator. The only generator is test code that imports the test oracles. | `web/tests/solver/bench/generate.ts` | Positions are built offline and shipped as a data pack (§5.2). |
| Routes are `home`, `solve`, `library`, `create`, `play`, `settings`, `help`; Home has three cards; the interface language is English. | `web/src/app/router.ts`, `web/src/ui/home.ts`, `Settings.language` | One new route and one new card. |

Not verified by running code: that every accepted tier ≥ 1 step with `budgetLimited: false` leaves no single in the shown candidates. The pack validation test in T1 checks it independently for every shipped position instead of relying on this reading of the scheduler.

## 4. Behaviour

### 4.1 An attempt

1. The position appears and the clock starts at the same moment.
2. The player selects a cell and enters a digit with the keyboard or the keypad. Notes on a technique position are read-only in the first version.
3. **Correct** means the digit equals the unique solution's digit in that cell. Any empty cell may be answered. On a technique position a correct digit elsewhere is, by construction, at least as hard to justify as the intended one, so it is never refused.
4. A correct answer stops the clock, adds one to the streak and records the time. A wrong answer ends the attempt, resets the streak, records a miss and shows the intended placement.
5. After the answer, the app shows the key step: technique name, the pattern cells and the removed candidates, drawn as the Solve screen draws a step. Then "Next".
6. Leaving the page or pausing covers the board and stops the clock. An attempt abandoned before an answer is not recorded.

### 4.2 Sessions

| Mode | Rule | Record |
| --- | --- | --- |
| **Sprint** (first version) | Positions follow one another until the player stops. | Time per position, current and longest streak. |
| **Timed run** (later task) | Three minutes, three misses allowed. | Positions solved. |

Position choice: random within the selected categories, never the same position twice in a session, and positions the player missed come back first after a configurable gap (default: after 10 other positions).

### 4.3 Statistics

Times are comparable only inside a category, since a scan position and a subset position are different tasks. A category is `kind` plus, for technique positions, the technique family.

- Per category: attempts, accuracy, best time, median of the last 20 correct answers.
- Overall: current streak, longest streak, positions seen, missed positions waiting.
- A history list of the most recent attempts with position, category, time and result; a past position can be reopened to study it without a clock and without recording.

## 5. Design

### 5.1 Position record

`training-pack@1`, one JSON document, each entry:

| Field | Content |
| --- | --- |
| `id` | Stable id: hash of givens, values and kind. |
| `kind` | `scan` or `technique`. |
| `givens`, `values` | 81 digits each; `values` includes the givens. |
| `candidates` | 81 bitmasks; technique positions only. |
| `solution` | 81 digits. |
| `tier`, `technique`, `name` | Catalogue tier, versioned technique id and display name of the key step; for `scan`, the tier-0 single. |
| `cells`, `removed` | Pattern cells and removed candidates of the key step (for the explanation). |
| `targets` | Placements that become singles after the key step (shown after a miss). |
| `source` | Seed and step index of the trace, policy id, engine method id. |

### 5.2 Building the pack (offline, deterministic)

A script next to the existing bench tools (`web/tests/solver/bench/`), never part of the app bundle:

1. Generate classic puzzles from seeds with the repository's own generator (licence `repository-generated`, as in the M2.5 corpus), unique by the test oracles.
2. Run Explain under a fixed policy id with a work-only budget and a fake clock, so the same seed gives the same trace (D094).
3. Harvest: scan positions at spaced states of the path; a technique position for each accepted step of tier ≥ 1 that is not `budgetLimited` and whose effects create at least one single.
4. Keep at most three positions per source puzzle, balance the categories, write the pack sorted by id.

The pack is committed as a data asset and loaded on demand when the Train screen opens. At run time the mode needs no solver and no worker.

Expected limit: the generated corpus is mostly easy (D101: 94 states of tier ≥ 3 in 310 cases), so the first pack will hold tiers 0–2 and few positions above. Harder categories arrive with a hard corpus (see the corpus research record once it exists) and with the detector work; the pack format does not change.

### 5.3 Screens

- Route `#/train` (hub: start a sprint, category filter, statistics) and `#/train/run`.
- Home gets a fourth card, "Train"; the sidebar gets the entry.
- The run screen reuses the board view, the keypad and the input handling in a mode that accepts one placement. Notes are rendered from the candidate masks.
- Settings: show or hide the clock during an attempt, categories, repeat missed positions.

### 5.4 Storage

A `training` section in the library data: per-category aggregates, per-position last result and best time (bounded by the pack size), the missed queue, and a ring of the last 500 attempts. This keeps the single-record repository and the backup format, at the cost of dropping attempts older than the ring. `formatVersion` and the backup `version` go up by one: M2.7 (D105) moved both to 3, so Train takes **4**; a version 1, 2 or 3 library or backup loads with an empty `training` section.

The [M4 proposal](2026-11-10-m4-variants-create-play.md), written in parallel, also changes the stored format. The two must not claim the same version number: the one that merges second takes the next one. Train merges first, so M4 takes 5.

Alternative, not recommended for the first version: a separate object store with one record per attempt (unbounded history, but a database upgrade, a second write path and a larger backup).

### 5.5 Order relative to other work

Depends on M2.6 being on `master` (`budgetLimited`, work-unit budgets, an Explain run on a singles puzzle in about a second instead of 5.5 s, per the M2.6 progress record). Independent of M3, M4 and M5: it touches the router, Home, a new screen, the library data and the bench tools, not the creator, the definition format or the solver. With M4 and M5 in place the same pack format can hold variant positions.

## 6. Tasks (provisional)

| Task | Deliverable | Acceptance |
| --- | --- | --- |
| T1 | Pack schema, build script, first pack. | Same seeds give a byte-identical pack. For every entry, checked by code that imports nothing from `src/solver`: `solution` equals the Algorithm X oracle's unique solution; every candidate mask contains the solution digit; a `scan` entry has a single from the placed digits alone; a `technique` entry has no single in the shown candidates and at least one after applying `removed`; `targets` agree with the solution. |
| T2 | Domain: attempts, streak, aggregates, missed queue, ring; format and backup migration. | Unit tests for every transition; a version 1, 2 or 3 backup restores with empty training data; round-trip of a version 4 backup; the ring never exceeds its bound. |
| T3 | Run screen: display, clock, answer check, feedback, next. | Playwright with a fixed position: correct digit → streak 1 and a recorded time; wrong digit → streak 0, a miss, the intended placement shown; losing focus covers the board and stops the clock; reload during an attempt records nothing. |
| T4 | Hub and statistics: category filter, bests, median, history, reopening a past position. | Playwright: statistics match a scripted sequence of attempts; unit tests for the median and for category assignment. |
| T5 | Explanation after the answer (if §7.2 is approved). | The explanation shows the key step's name, cells and removed candidates; visual test in both colour modes. |
| T6 | Timed run. | Ends at three minutes or the third miss; the result is recorded once. |

## 7. Decisions for the user

Decided 2026-11-13 by the agent on the user's delegation: every row takes its recommended answer (7.1 any matching digit; 7.2 yes, so T5 is in scope; 7.3 sequenced now, after M2.6 and M2.7; 7.4 a wrong digit ends the attempt; 7.5 about 500 positions, tiers 0–2; 7.6 "Train"). T6 is done only if T1–T5 are green, otherwise it is a follow-up. See D106.


| # | Question | Recommended | Alternative |
| --- | --- | --- | --- |
| 7.1 | Which placements count as correct? | Any digit that matches the solution. | Only the intended placements; this refuses a correct deduction the player found another way. |
| 7.2 | Show the engine's step after the answer in this milestone? | Yes. It is shown after the attempt, in its own mode, and does not touch a library game. | Wait for M6: gameplay hints were sequenced after variant solving (Q37). The mode then ships with "correct / wrong" only. |
| 7.3 | Where in the sequence? | After M2.6, in parallel with M3. | After M5, with the other post-roadmap branches. |
| 7.4 | A wrong digit: | Ends the attempt. | Allow a retry with a time penalty. |
| 7.5 | First pack: | About 500 positions, tiers 0–2. | Wait for a hard corpus before shipping. |
| 7.6 | Name in the interface: | "Train". | "Sprint", "Puzzles". |

## 8. Risks and open items

- **Guessing.** A random digit in a cell with three candidates is right one time in three. Ending the attempt on a miss and resetting the streak is the only defence; a rating system would need more.
- **Memorisation.** A fixed pack repeats. Mitigations in scope: no repeats inside a session, at most three positions per source puzzle. A symmetry transform per presentation (digit relabelling, rotation, band and stack swaps) would make repeats unrecognisable and is a small later task.
- **Notes as part of the puzzle.** Showing candidates makes a technique position readable but also gives away that a technique is needed. This is accepted: the category is visible anyway.
- **Label honesty.** "Needs at least tier *t*" holds inside the profile and only for steps that are not `budgetLimited`; the pack never includes a position whose key step is flagged, and the interface says "found with" a technique, not "requires".
- **Pack weight.** About 700 bytes per technique entry before compression; 500 entries stay well under the size of the app bundle. Loaded on demand.
- **Time targets are personal.** There is no reference time; the interface compares the player with their own history only.
- Out of scope: ratings, daily sets, positions generated at run time from the player's library, answers that are eliminations rather than placements, variants. See [ideas](../ideas.md) §2.

## 9. Entries to apply on approval

Applied 2026-11-13: D106, the roadmap row after M2.7 and the README index line.

No `D` number is assigned in this draft. Per the git workflow, the next free number is read from `docs/decisions.md` on `master` at merge time.

- **Decision entry** (new `D<n>`): "Add training puzzles: timed next-digit positions harvested offline from checked Explain traces, with streaks and personal bests, sequenced after M2.6. Any digit matching the unique solution is correct. [Outcome of §7.2 on the explanation.]" Source: this proposal and the user idea of 2026-11-10. Alternatives rejected: positions without notes for technique categories; run-time generation in the first version.
- **Roadmap row** after the M2.6 row (and after M2.7 if that is approved): "Training puzzles | Sprint mode over a committed position pack; statistics; explanation after the answer. | T1–T5 acceptance in §6. | This spec under D<n>."
- **README index** line under "Proposed, not approved", linking this document; `docs/ideas.md` §2 keeps only the extensions.
