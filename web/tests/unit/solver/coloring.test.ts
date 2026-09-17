import { expect, test } from "vitest";
import { getTechniques } from "../../../src/solver/techniques/registry";
import { fixtureCase, fixtureView } from "../../solver/acceptance";
import { assertSound } from "../../solver/acceptance";
import {
  chainFixture,
  chainFixtures,
  independentChainCertificate,
  IndependentChainProof,
} from "../../solver/chains-acceptance";
import { discoveryContext } from "../../solver/discovery-context";
import type { ColoringPattern } from "../../../src/solver/techniques/coloring";
import { checkProposal, verifyCertificate } from "../../../src/solver/proof/checker";
import { retainedProof } from "../../../src/solver/state/candidates";
import type { DeductionProposal } from "../../../src/solver/proof/types";

test.each(["c14@1", "c15@1"])("%s provides checked coloring alternatives", (id) => {
  const descriptor = getTechniques("classic-expanded@1").find((d) => d.id === id)!;
  expect(descriptor.eligible(fixtureView(fixtureCase("C01-one-hole")))).toEqual({ kind: "yes" });
});

test.each(chainFixtures.filter((f) => ["C14", "C15"].includes(f.rowId)))(
  "$id has independent complete XOR evidence and oracle acceptance",
  (f) => {
    expect(() => assertSound(fixtureView(f), independentChainCertificate(f))).not.toThrow();
  },
  30000,
);

test.each(chainFixtures.filter((f) => ["C14", "C15"].includes(f.rowId)))(
  "$id has sound production component discovery",
  (f) => {
    const view = fixtureView(f),
      wanted = independentChainCertificate(f).pattern as unknown as ColoringPattern;
    const detector = getTechniques("classic-expanded@1").find(
        (d) => d.id === f.rowId.toLowerCase() + "@1",
      )!,
      context = discoveryContext();
    let found = false;
    for (const event of detector.discover(view, context)) {
      if (event.kind === "interrupted") throw Error(`discovery:${f.id}:${event.reason}`);
      if (
        event.kind !== "proposal" ||
        (event.proposal.pattern as unknown as ColoringPattern).form !== wanted.form
      )
        continue;
      expect(() => assertSound(view, event.proposal)).not.toThrow();
      found = true;
      break;
    }
    expect(found).toBe(true);
    expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  },
  60000,
);

test.each(chainFixtures.filter((f) => ["C14", "C15"].includes(f.rowId)))(
  "$id requires complete edges, XOR and every branch proof",
  (f) => {
    const view = fixtureView(f),
      context = {
        view,
        retained: retainedProof(view),
        limits: discoveryContext().limits,
        policy: "discharged" as const,
        uniqueEvidenceId: null,
      };
    for (const mutation of [
      "false-xor",
      "omit-edge",
      "omit-member",
      "omit-branch",
      "wrong-conflict",
      "substitute-leaf",
      "assumption-escape",
      "wrong-alias",
    ]) {
      const proposal = structuredClone(independentChainCertificate(f)),
        p = proposal.pattern as unknown as ColoringPattern;
      if (mutation === "false-xor")
        p.components[0].edges[0].roots[1] = p.components[0].edges[0].roots[0];
      if (mutation === "omit-edge") p.components[0].edges.pop();
      if (mutation === "omit-member") p.components[0].colors[0].pop();
      if (mutation === "omit-branch") p.branches.pop();
      if (mutation === "wrong-conflict") {
        p.branches[0].conflict = [p.components[0].colors[0][0], p.components[0].colors[1][0]];
        p.branches[0].witnesses = [];
      }
      if (mutation === "substitute-leaf") p.branches[0].proofs[0] = p.branches[1].proofs[0];
      if (mutation === "assumption-escape")
        (
          proposal.proof.nodes.find((n) => n.rule === "cases@1") as unknown as { scope: number[] }
        ).scope = [];
      if (mutation === "wrong-alias") p.alias = "Unproved coloring";
      if (mutation === "assumption-escape") {
        const assumption = proposal.proof.nodes.find((n) => n.rule === "assume@1")!;
        (proposal.proof as unknown as { roots: number[] }).roots.push(assumption.id);
      }
      expect([...checkProposal(proposal, context)].at(-1)?.kind, mutation).toBe("rejected");
    }
  },
);

test("Multi-coloring has exactly four discharged leaves and depth-two metadata; Medusa has depth one", () => {
  const proposal = independentChainCertificate(chainFixture("C14-multi")),
    p = proposal.pattern as unknown as ColoringPattern;
  expect(p.components).toHaveLength(2);
  expect(p.branches).toHaveLength(4);
  expect(p.branches.every((b) => b.proofs.every((proof) => proof.assumptions.length === 2))).toBe(
    true,
  );
  const descriptors = getTechniques("classic-expanded@1");
  expect(descriptors.find((d) => d.id === "c14@1")!.bounds).toMatchObject({
    maxBranchDepth: 2,
    maxAlternatives: 4,
  });
  expect(descriptors.find((d) => d.id === "c15@1")!.bounds).toMatchObject({
    maxBranchDepth: 1,
    maxAlternatives: 2,
  });
});

test.each([false, true])(
  "a primitive-valid resolution substitute cannot decorate four cases: mixed=%s",
  (mixed) => {
    const f = chainFixture("C14-multi"),
      good = independentChainCertificate(f),
      p = good.pattern as unknown as ColoringPattern,
      view = fixtureView(f),
      b = new IndependentChainProof(view);
    const sources: number[] = [];
    for (const component of p.components)
      for (const edge of component.edges)
        sources.push(b.strong(edge.source, edge.ends), b.weak(...edge.ends));
    for (const branch of p.branches) {
      if (branch.conflict) sources.push(b.weak(...branch.conflict));
      else
        branch.witnesses.forEach((witness, i) =>
          sources.push(
            b.weak(witness, {
              cell: good.effects[i].cell,
              symbol: good.effects[i].symbol,
              positive: true,
            }),
          ),
        );
    }
    const packaged = b.package(sources),
      roots = good.effects.map((e) =>
        b.infer(packaged, { cell: e.cell, symbol: e.symbol, positive: false }),
      );
    const smaller = b.proposal("C14", good.pattern, [...good.effects], roots);
    let proposal: DeductionProposal = smaller;
    if (mixed) {
      const first = Math.min(...smaller.proof.nodes.map((n) => n.id)),
        offset = Math.max(...good.proof.nodes.map((n) => n.id)) + 1 - first;
      const move = (id: number) => (id < first ? id : id + offset);
      proposal = {
        ...good,
        proof: {
          ...good.proof,
          nodes: [
            ...good.proof.nodes,
            ...smaller.proof.nodes.map((n) => ({
              ...n,
              id: move(n.id),
              premises: n.premises.map(move),
            })),
          ],
          imports: [...new Set([...good.proof.imports, ...smaller.proof.imports])].sort(
            (a, b) => a - b,
          ),
          roots: [...good.proof.roots, ...smaller.proof.roots.map(move)],
        },
      };
    }
    const context = {
      view,
      retained: retainedProof(view),
      limits: discoveryContext().limits,
      policy: "discharged" as const,
      uniqueEvidenceId: null,
    };
    expect([...verifyCertificate(proposal, context)].at(-1)?.kind).toBe("verified");
    expect([...checkProposal(proposal, context)].at(-1)?.kind).toBe("rejected");
  },
);

test("Simple coloring is a checked presentation of the exact trap component", () => {
  const f = chainFixture("C14-trap"),
    proposal = structuredClone(independentChainCertificate(f));
  (proposal.pattern as unknown as ColoringPattern).alias = "Simple coloring";
  expect(() => assertSound(fixtureView(f), proposal)).not.toThrow();
});
