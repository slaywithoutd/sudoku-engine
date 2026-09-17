// Test-only fresh realm loader. It copies no authority and implements no app transport.
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parentPort, workerData } from "node:worker_threads";
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && context.parentURL) {
      const url = new URL(specifier, context.parentURL);
      if (!url.pathname.endsWith(".ts") && existsSync(fileURLToPath(url) + ".ts"))
        return { url: url.href + ".ts", shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".ts"))
      return {
        format: "module",
        source: stripTypeScriptTypes(readFileSync(new URL(url), "utf8"), {
          mode: "transform",
          sourceUrl: url,
        }),
        shortCircuit: true,
      };
    return next(url, context);
  },
});
try {
  const { ConditionalOperation, uniqueAuthorityMatches } =
    await import("../../src/solver/conditional.ts");
  const { assemble } = await import("../../src/solver/rules/assemble.ts");
  const { AllDifferentRule } = await import("../../src/solver/rules/all-different.ts");
  const { IndexWorkspace } = await import("../../src/solver/indexes/workspace.ts");
  const assembled = assemble(workerData.expected.snapshot.problem, [new AllDifferentRule()]);
  if (!assembled.ok) throw Error("worker-assembly");
  const workspace = new IndexWorkspace({
    entryLimit: 1_000_000,
    byteLimit: workerData.limits.workspaceBytes,
  });
  const installation = ConditionalOperation.installTrustedBootstrap(
    workerData.port,
    workerData.expected,
    assembled.value,
    workerData.limits,
    workspace,
  );
  await installation.providePrefix(workerData.prefix);
  const operation = await installation.ready;
  const ready = uniqueAuthorityMatches(operation.authority, operation.view);
  const events = [];
  for (const proposal of workerData.bundles)
    for (const event of operation.checkAndCommit(proposal))
      if (event.kind !== "work")
        events.push(
          event.kind === "checked"
            ? { kind: event.kind, conditional: event.step.consequences.every((c) => c.conditional) }
            : event,
        );
  const values = operation.view.state.values,
    domains = operation.view.state.domains;
  operation.dispose();
  parentPort.postMessage({ ready, events, values, domains, usage: workspace.usage });
} catch (error) {
  parentPort.postMessage({ error: String(error) });
}
