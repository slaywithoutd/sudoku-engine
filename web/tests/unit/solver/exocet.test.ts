import { expect, test } from "vitest";
import { getTechniques } from "../../../src/solver/techniques/registry";
import { fixtureView, type TechniqueFixture } from "../../solver/acceptance";
import fixtures from "../../solver/fixtures/C31.json";

test("C31 exposes an eligible specialized descriptor on authentic original-clue geometry", () => {
  const f = fixtures[0] as unknown as TechniqueFixture;
  const view = fixtureView(f);
  const descriptor = getTechniques("classic-expanded@1").find((d) => d.id === "c31@1")!;
  expect(descriptor.eligible(view)).toEqual({ kind: "yes" });
});
import { compileExocet, type ExocetPlan } from "../../../src/solver/techniques/exocet";
import { checkProposal } from "../../../src/solver/proof/checker";
import { retainedProof } from "../../../src/solver/state/candidates";
import { discoveryContext } from "../../solver/discovery-context";

test.each(fixtures)(
  "$id checks the independent Junior counts and actual component join",
  (f) => {
    const view = fixtureView(f as unknown as TechniqueFixture),
      cursor = compileExocet(view, f.expectedPattern as unknown as ExocetPlan);
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
    const limits = { ...discoveryContext().limits, timeMs: 120000, workUnits: 100000000 };
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
  },
  150000,
);
import { discoverSpecialized } from "../../solver/specialized-acceptance";
test.each(["C31-junior-3", "C31-double-shared-base"])(
  "%s has actual semantic-family discovery",
  (id) => {
    const f = fixtures.find((f) => f.id === id)!;
    expect(
      discoverSpecialized(f as unknown as TechniqueFixture, (p) =>
        id.includes("double") ? p.alias === "Double Exocet" : p.alias === "Junior Exocet",
      ).proposal.effects.length,
    ).toBeGreaterThan(0);
  },
  200000,
);
