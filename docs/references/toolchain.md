# First-release toolchain research

Execution update, 2026-09-12: these exact pins were installed and exercised successfully during M1. See [release verification](../release-verification.md) for actual results. The research account below records the earlier planning checks.

Checked 2026-09-12. Local read-only checks report Node `v24.19.0` and npm `11.17.0`. Official npm metadata supports the pins below on that Node version; no packages were installed and no runtime compatibility tests were run during planning.

| Development package | Exact pin | Declared Node requirement | Source |
| --- | --- | --- | --- |
| TypeScript | 7.0.2 | >=16.20.0 | [Registry metadata](https://registry.npmjs.org/typescript/7.0.2) |
| Vite | 8.3.0 | ^20.19.0 or >=22.12.0 | [Registry metadata](https://registry.npmjs.org/vite/8.3.0) |
| Vitest | 5.0.0 | ^22.12.0, ^24.0.0, or >=26.0.0 | [Registry metadata](https://registry.npmjs.org/vitest/5.0.0) |
| Playwright Test | 1.63.0 | >=20 | [Registry metadata](https://registry.npmjs.org/@playwright%2ftest/1.63.0) |
| fake-indexeddb | 6.2.5 | >=18 | [Registry metadata](https://registry.npmjs.org/fake-indexeddb/6.2.5) |
| @types/node | 24.13.4 | No engine declared | [Registry metadata](https://registry.npmjs.org/@types%2fnode/24.13.4) |

Vitest metadata accepts Vite 8. Preserve optional dependencies when installing TypeScript's platform packages. Pin package versions and commit the generated lockfile at implementation time. Recheck compatibility if execution occurs much later or the runtime differs; do not silently upgrade the plan's pins.

Vite transpilation does not perform full TypeScript checking; run `tsc --noEmit` separately. See [Vite TypeScript support](https://vite.dev/guide/features#typescript) and [Vitest configuration](https://vitest.dev/guide/).

Use the stable personal address `http://localhost:5173` with `strictPort`. Browser tests use `http://127.0.0.1:5174` with an isolated context/profile so test resets never target personal storage. See [Vite server options](https://vite.dev/config/server-options#server-strictport), [Playwright web servers](https://playwright.dev/docs/test-webserver), and [test isolation](https://playwright.dev/docs/browser-contexts).

Prefer native IndexedDB behind a small adapter, without a runtime storage library initially. Treat a write as saved only after transaction completion; handle abort/error, blocked upgrades, and version changes. Never await unrelated timers/network work inside a transaction. See [IndexedDB usage](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB).

Inject a fresh `IDBFactory` from fake-indexeddb per unit test and close connections after use. Its in-memory behavior does not establish real browser durability, quota, or eviction behavior. Test reload/reopened pages in the same browser context and use a temporary persistent profile for a genuine browser-restart check. See [fake-indexeddb](https://github.com/dumbmatter/fakeIndexedDB) and the Playwright isolation source above.
