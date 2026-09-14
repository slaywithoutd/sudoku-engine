import type { ReadView, Literal } from "../state/types";
import type { Effect, DeductionProposal } from "../proof/types";
import { proposedClause } from "../proof/builder";
import { ForcingProof, opposite, symbols, type ForcingLink, type PathCertificate } from "./forcing-proof";
import { forcingDescriptor, discoverForcing } from "./forcing-runtime";

export interface ForcingPlan {
  /** D088: retain the complete negative theorem without candidate progress. */
  readonly mode?: "cache";
  readonly cacheTarget?: Literal;
  readonly kind: "digit" | "cell" | "unit" | "nishio";
  readonly alias: string;
  readonly cover: { readonly cell?: number; readonly house?: string; readonly symbol?: number; readonly candidate?: Literal };
  readonly alternatives: readonly Literal[];
  readonly branches: readonly { readonly assumption: Literal; readonly result: Literal | "false"; readonly paths: readonly (readonly ForcingLink[])[] }[];
}
export interface ForcingCertificate {
  readonly cover: number | null;
  readonly branches: readonly { readonly assumption: number; readonly result: number; readonly paths: readonly PathCertificate[] }[];
  readonly root: number;
}
/** Syntax compilation only. Independent grammar binds every path to its cases. */
export function compileForcing(view: ReadView, plan: ForcingPlan, effect: Effect): DeductionProposal {
  const b = new ForcingProof(view); let cover: number | null = null;
  if (plan.kind === "cell") cover = b.cover(plan.cover.cell!);
  else if (plan.kind === "unit") cover = b.houseCover(plan.cover.house!, plan.cover.symbol!);
  else if (plan.kind === "digit") {
    const candidate = plan.cover.candidate!; cover = b.cover(candidate.cell);
    const others = symbols(view, candidate.cell).filter(s => s !== candidate.symbol);
    for (const [i, symbol] of others.entries()) {
      const weak = b.edge({ from: { ...candidate, symbol }, to: opposite(candidate), reason: {kind:"cell-conflict", cell:candidate.cell} });
      cover = b.add("resolution@1", [cover, weak], proposedClause([candidate, opposite(candidate), ...others.slice(i+1).map(symbol => ({...candidate,symbol}))]));
    }
  }
  const cases = plan.branches.map(branch => {
    b.scope = []; const assumption = b.add("assume@1", [], proposedClause([branch.assumption])); b.scope = [assumption];
    const paths = branch.paths.map(path => b.path(assumption, path));
    const result = branch.result === "false" ? b.add("contradiction@1", paths.map(p => p.end), {kind:"false"}) : paths[0].end;
    return { assumption, paths, result };
  });
  b.scope = []; let root: number;
  if (plan.kind === "nishio") root = b.add("discharge@1", [cases[0].assumption, cases[0].result], proposedClause([{ cell:effect.cell,symbol:effect.symbol,positive:false }]));
  else {
    // CasesStrategy consumes the canonical signed-clause order (negative first).
    const ordered = cases.map((c,i) => ({ c, a: plan.branches[i].assumption })).sort((a,b) => a.a.cell-b.a.cell || a.a.symbol-b.a.symbol || Number(a.a.positive)-Number(b.a.positive));
    root = b.add("cases@1", [cover!, ...ordered.flatMap(({c}) => [c.assumption,c.result])], proposedClause([{cell:effect.cell,symbol:effect.symbol,positive:effect.kind==="place"}]));
  }
  if(plan.mode==="cache") {
    if(effect.kind!=="remove")throw Error("forcing-cache-negative-only");
    return b.bundle("c22@1",{...plan,cacheTarget:{cell:effect.cell,symbol:effect.symbol,positive:false},certificate:{cover,branches:cases,root} satisfies ForcingCertificate},[],[root]);
  }
  return b.finish("c22@1", { ...plan, certificate: { cover, branches: cases, root } satisfies ForcingCertificate }, effect, root);
}
export type { ForcingLink } from "./forcing-proof";
export const forcingTechniques=Object.freeze([forcingDescriptor("C22",discoverForcing)]);
