# Architecture research and stack options

_Historical record, kept as written on 2026-09-12. Branch and worktree names it mentions no longer exist; everything is on `master`._

Checked: 2026-09-12. Status: research record. The browser-first recommendation was subsequently adopted in Round 5 Q31/D037; the authoritative design is `../superpowers/specs/2026-09-12-platform-design.md`. Sources are official project documentation and MDN browser documentation. No performance benchmarks were run.

## Recommendation for discussion

TypeScript with Vite, browser-owned state, and IndexedDB best matches the current personal localhost release. Add solving later behind a worker interface. A UI framework is a separate choice. Keep domain interfaces independent of the rendering framework and execution location.

This recommendation follows the agreed scope, not a requirement to remove Java. The existing repository has classic validation but no solver or persisted user dataset to migrate, based on source inspection in `current-application.md`.

| Approach | Benefits | Tradeoffs |
| --- | --- | --- |
| Retain Java/Spring and improve the frontend | Least structural change; existing validators can remain. | Frontend history/persistence still need redesign. Immediate board interaction should not depend on HTTP round trips. |
| TypeScript browser-first | One language for interaction, data models, immediate validation, and an initial solver; fits browser-local storage. | Migrates the small existing implementation; future solver performance must be measured. |
| TypeScript frontend with a later optional Java solver service | Preserves an escape route for workloads or tooling that justify a service. | Two runtimes add complexity if introduced before needed; the boundary can exist before the service. |

## Local tooling and stable origin

[Vite](https://vite.dev/guide/) provides a local development server and [static production builds](https://vite.dev/guide/build), without requiring a particular UI framework. It supports [module workers](https://vite.dev/guide/features.html#web-workers).

Browser storage is scoped to the [origin](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy), including scheme, host, and port. Use a stable localhost address. Vite's [strictPort option](https://vite.dev/config/server-options#server-strictport) can prevent silently switching to another port if the intended one is occupied. Otherwise, a changed origin could make the saved library appear absent.

## Persistence and undo

[IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) supports asynchronous structured-object storage and transactions. Proposed design: save each current draft/play state and corresponding history atomically, with versioned data and migrations. A dedicated storage worker is not required by the initial scope.

Browser retention is not a backup guarantee: [storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) vary, users can clear data, and default storage is best effort. Handle failed writes visibly and keep the approved JSON backup path. Q32/D038 subsequently confirms histories/settings in backups.

## Solver execution

[Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers) run background tasks and can be terminated. Proposed interface: send a puzzle snapshot with a revision identifier; return results, explanations, and progress tied to that revision. Make time limits and cancellation explicit so stale results cannot overwrite later user edits.

A worker does not establish acceptable solve times for arbitrary variant combinations. Benchmark representative puzzles before committing to performance guarantees or deciding a server is unnecessary for every future workload.

## Generated rule code

Workers can access network APIs and IndexedDB; an ordinary worker alone is not a sufficient execution boundary for untrusted generated code. This follows the capabilities documented in the worker source above.

Recommendation for later design: use declarative constraints where suitable, and define a restricted environment and verification workflow for executable generated extensions. Selecting TypeScript or Java does not solve this part of the product. Q30 asks the user about the review policy; that answer must govern the eventual workflow.

## Migration flexibility

Spring can serve a built frontend from [static resources](https://docs.spring.io/spring-boot/reference/web/servlet.html), so introducing a frontend build does not force immediate removal of Spring. Choose the simplest end-to-end design after comparing migration effort and agreed solver requirements.
