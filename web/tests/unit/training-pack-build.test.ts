import { describe, expect, test } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PACK_SEED_BASE, buildPack, serializePack, traceSeed } from "../solver/bench/training-pack";
import type { TrainingPack } from "../../src/domain/training-pack";

/**
 * The training pack is rebuilt from its seeds (spec §6 T1, D106). The normal
 * suite replays the first seeds twice and checks they give byte-identical
 * output that the committed pack contains line for line.
 * `TRAIN_PACK=write` rebuilds and writes the whole pack; `TRAIN_PACK=check`
 * rebuilds it and compares it with the committed file byte for byte.
 */
const packPath = fileURLToPath(new URL("../../src/assets/training-pack.json", import.meta.url));
const mode = process.env.TRAIN_PACK;
const seeds = (count: number) => Array.from({ length: count }, (_, i) => PACK_SEED_BASE + i);

describe("training pack build", () => {
  test("the first seeds replay byte for byte and match the committed pack", async () => {
    const committed = readFileSync(packPath, "utf8").split("\n");
    const first = serializePack(await buildPack(seeds(4))),
      second = serializePack(await buildPack(seeds(4)));
    expect(second).toBe(first);
    const lines = first.split("\n").slice(1, -2);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const bare = line.replace(/,$/, "");
      expect(committed.some((entry) => entry.replace(/,$/, "") === bare)).toBe(true);
    }
  }, 300_000);

  test("committed positions of the first seeds are plain steps of their trace", async () => {
    // Never a budget-limited or set-limited key step (spec §8), and the board is the trace's.
    const pack = JSON.parse(readFileSync(packPath, "utf8")) as TrainingPack;
    for (const seed of seeds(4)) {
      const trace = await traceSeed(seed);
      for (const p of pack.positions.filter((entry) => entry.source.seed === seed)) {
        const step = trace?.steps[p.source.step];
        expect(step?.technique).toBe(p.technique);
        expect(step?.budgetLimited).toBe(false);
        expect(step?.setLimited).toBeUndefined();
        const before = p.source.step === 0 ? trace?.givens : trace?.steps[p.source.step - 1].values;
        expect(before?.join("")).toBe(p.values);
      }
    }
  }, 300_000);

  test.runIf(mode === "write" || mode === "check")(
    "full rebuild",
    async () => {
      const built = serializePack(await buildPack());
      if (mode === "write") writeFileSync(packPath, built);
      else expect(built).toBe(readFileSync(packPath, "utf8"));
    },
    7_200_000,
  );
});
