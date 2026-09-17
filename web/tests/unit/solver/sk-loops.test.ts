import { expect, test } from "vitest";
import { getTechniques } from "../../../src/solver/techniques/registry";
import { fixtureView, type TechniqueFixture } from "../../solver/acceptance";
import fixtures from "../../solver/fixtures/C30.json";

test("C30 exposes an eligible specialized descriptor on authentic original-clue geometry", () => {
  const f = fixtures[0] as unknown as TechniqueFixture;
  const view = fixtureView(f);
  const descriptor = getTechniques("classic-expanded@1").find((d) => d.id === "c30@1")!;
  expect(descriptor.eligible(view)).toEqual({ kind: "yes" });
});
import { compileSkLoop, type SkPlan } from "../../../src/solver/techniques/sk-loops";
import { checkProposal } from "../../../src/solver/proof/checker";
import { retainedProof } from "../../../src/solver/state/candidates";
import { discoveryContext } from "../../solver/discovery-context";

test("C30 all-double has complete eight-pair closure and checked effects", () => {
  const f = fixtures.find((f) => f.id === "C30-all-double")! as unknown as TechniqueFixture,
    view = fixtureView(f),
    cursor = compileSkLoop(view, f.expectedPattern as unknown as SkPlan);
  let proposal;
  while (true) {
    const n = cursor.next();
    if (n.done) {
      proposal = n.value;
      break;
    }
  }
  expect(proposal).not.toBeNull();
  expect(proposal!.effects).toEqual(expect.arrayContaining(f.expectedEffects));
  const limits = { ...discoveryContext().limits, timeMs: 180000, workUnits: 200000000 };
  let terminal;
  for (const e of checkProposal(proposal!, {
    view,
    retained: retainedProof(view),
    limits,
    policy: "unconditional",
    uniqueEvidenceId: null,
  }))
    if (e.kind !== "work") terminal = e;
  expect(terminal?.kind, JSON.stringify(terminal)).toBe("checked");
}, 200000);
import { discoverSpecialized } from "../../solver/specialized-acceptance";
test("C30 discovers and independently admits a real closed eight-group ring", () => {
  const f = fixtures.find((f) => f.id === "C30-all-double")!;
  expect(
    discoverSpecialized(f as unknown as TechniqueFixture, (p) => p.linkMultiplicity === 16).proposal
      .effects.length,
  ).toBeGreaterThan(0);
}, 200000);
