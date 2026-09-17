import { expect, test } from "vitest";
import { CertificateBuilder, literal } from "../../../src/solver/proof/builder";
import { fixtureCase, fixtureView } from "../../solver/acceptance";

test("allocates proposed IDs above all retained keys at the supported run-node maximum", () => {
  const view = fixtureView(fixtureCase("C01-one-hole"));
  const fact = view.facts.values().next().value!;
  const facts = new Map(Array.from({ length: 262144 }, (_, index) => [2 * index, fact] as const));
  const builder = new CertificateBuilder({ ...view, facts });
  expect(builder.add("proposed-only@1", [], literal(0, 1, true))).toBe(524287);
  expect(builder.add("proposed-only@1", [], literal(1, 2, true))).toBe(524288);
});
