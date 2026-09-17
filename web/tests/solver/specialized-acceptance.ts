import { checkProposal } from "../../src/solver/proof/checker";
import { retainedProof } from "../../src/solver/state/candidates";
import { getTechniques } from "../../src/solver/techniques/registry";
import { fixtureView, type TechniqueFixture } from "./acceptance";
import { discoveryContext } from "./discovery-context";
import type { DeductionProposal } from "../../src/solver/proof/types";
import { oracle } from "./oracle";

/** Stop on a semantic family feature, never a display-house presentation. */
export function discoverSpecialized(f: TechniqueFixture, matches: (p: any) => boolean) {
  const view = fixtureView(f),
    context = discoveryContext();
  context.limits.timeMs = 120000;
  let work = 0,
    found: DeductionProposal | undefined,
    ending;
  const cursor = getTechniques("classic-expanded@1")
    .find((d) => d.id === f.rowId.toLowerCase() + "@1")!
    .discover(view, context);
  try {
    for (const event of cursor) {
      if (event.kind === "work") work += event.units;
      else if (event.kind === "proposal" && matches(event.proposal.pattern)) {
        found = event.proposal;
        break;
      } else if (event.kind !== "proposal") ending = event;
    }
  } finally {
    cursor.return();
  }
  if (context.workspace.usage.bytes || context.workspace.usage.entries)
    throw Error("leaked-specialized-discovery");
  if (!found)
    throw Error(`missing-specialized-discovery:${f.id}:${work}:${JSON.stringify(ending)}`);
  const limits = { ...context.limits, timeMs: 180000, workUnits: 200000000 };
  let terminal;
  for (const event of checkProposal(found, {
    view,
    retained: retainedProof(view),
    limits,
    policy: "discharged",
    uniqueEvidenceId: null,
  }))
    if (event.kind !== "work") terminal = event;
  if (terminal?.kind !== "checked")
    throw Error(`discovered-specialized-rejected:${JSON.stringify(terminal)}`);
  const input = {
    givens: [...f.givens].map(Number),
    domains: [...view.state.domains],
    limit: 1,
    maxNodes: 1000000,
  };
  if (!oracle(input).witnesses.length) throw Error("unsatisfiable-specialized-discovery-prestate");
  for (const e of found.effects) {
    const counter =
        e.kind === "remove"
          ? { force: [e.cell, e.symbol] as [number, number] }
          : { forbid: [e.cell, e.symbol] as [number, number] },
      r = oracle({ ...input, ...counter });
    if (r.interrupted || !r.exhausted || r.witnesses.length)
      throw Error(`unsound-discovered-specialized-effect:${JSON.stringify(e)}`);
  }
  return { view, proposal: found, work };
}
