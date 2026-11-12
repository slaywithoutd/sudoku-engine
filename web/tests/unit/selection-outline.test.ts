import { describe, expect, it } from "vitest";
import { concaveCorners, mergedSides, selectionOutlinePath } from "../../src/ui/selection-outline";

const cells = (...indexes: number[]) => new Set(indexes);
const loops = (path: string) => path.split("M").filter(Boolean);
/** Corner points (control points of the Q curves and bare L vertices). */
const corners = (path: string) =>
  [...path.matchAll(/Q([\d.]+) ([\d.]+)|[ML]([\d.]+) ([\d.]+)(?!Q)/g)].map(
    ([, curveX, curveY, lineX, lineY]) => (curveX ? [+curveX, +curveY] : [+lineX, +lineY]),
  );

/** Small deterministic PRNG (mulberry32) so the property test is reproducible. */
const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
};

describe("selectionOutlinePath", () => {
  it("is empty without a selection", () => {
    expect(selectionOutlinePath(cells())).toBe("");
  });

  it("draws a single inset square for one cell", () => {
    const path = selectionOutlinePath(cells(0), 9, 0.1, 0);
    expect(loops(path)).toHaveLength(1);
    expect(corners(path)).toEqual(
      expect.arrayContaining([
        [0.1, 0.1],
        [0.9, 0.1],
        [0.9, 0.9],
        [0.1, 0.9],
      ]),
    );
    expect(corners(path)).toHaveLength(4);
  });

  it("merges edge-adjacent cells into one rectangle", () => {
    const path = selectionOutlinePath(cells(0, 1, 2), 9, 0.1, 0);
    expect(loops(path)).toHaveLength(1);
    expect(corners(path)).toHaveLength(4);
    expect(corners(path)).toEqual(
      expect.arrayContaining([
        [0.1, 0.1],
        [2.9, 0.1],
        [2.9, 0.9],
        [0.1, 0.9],
      ]),
    );
  });

  it("keeps a clean concave corner on an L shape", () => {
    // r1c1 r1c2 over r2c2
    const path = selectionOutlinePath(cells(0, 1, 10), 9, 0.1, 0);
    expect(loops(path)).toHaveLength(1);
    expect(corners(path)).toHaveLength(6);
    // The concave corner moves out of the notch, not into a stair step.
    expect(corners(path)).toEqual(expect.arrayContaining([[1.1, 0.9]]));
  });

  it("only rounds convex corners", () => {
    const path = selectionOutlinePath(cells(0, 1, 10), 9, 0.1, 0.05);
    expect((path.match(/Q/g) ?? []).length).toBe(5);
  });

  it("keeps diagonal-only neighbours as separate loops", () => {
    const path = selectionOutlinePath(cells(0, 10), 9, 0.1, 0);
    expect(loops(path)).toHaveLength(2);
    expect(corners(path)).toHaveLength(8);
  });

  it("draws one loop per disconnected region", () => {
    const path = selectionOutlinePath(cells(0, 1, 40, 80), 9, 0.1, 0);
    expect(loops(path)).toHaveLength(3);
  });

  it("handles a ring with a hole", () => {
    // 3×3 block minus its centre
    const path = selectionOutlinePath(cells(0, 1, 2, 9, 11, 18, 19, 20), 9, 0.1, 0);
    expect(loops(path)).toHaveLength(2);
  });
});

describe("selectionOutlinePath in any click order", () => {
  it("does not bridge a region that pinches itself diagonally, whatever the click order", () => {
    // 3×3 at r7-9 c5-7 minus its centre and bottom-left cell: the hole and
    // the outside touch at a single point, in an unsorted (ctrl-click) order.
    const order = [68, 50, 69, 60, 49, 58, 51];
    const path = selectionOutlinePath(new Set(order), 9, 0.1, 0);
    const sorted = selectionOutlinePath(
      new Set([...order].sort((left, right) => left - right)),
      9,
      0.1,
      0,
    );
    for (const [x, y] of corners(path)) {
      expect(order).toContain(Math.floor(y) * 9 + Math.floor(x));
    }
    expect(loops(path)).toHaveLength(loops(sorted).length);
    expect(corners(path)).toHaveLength(corners(sorted).length);
  });

  it("keeps every corner inside a selected cell for random selections and orders", () => {
    const next = random(20261112);
    for (let run = 0; run < 5000; run++) {
      const order: number[] = [];
      const count = 1 + Math.floor(next() * 30);
      while (order.length < count) {
        const index = Math.floor(next() * 81);
        if (!order.includes(index)) order.push(index);
      }
      const selection = new Set(order);
      const path = selectionOutlinePath(selection, 9, 0.1, 0);
      for (const [x, y] of corners(path)) {
        expect(selection.has(Math.floor(y) * 9 + Math.floor(x)), `${order.join(",")}`).toBe(true);
      }
    }
  });
});

describe("mergedSides", () => {
  it("reports which neighbours are selected", () => {
    expect(mergedSides(10, cells(1, 10, 11))).toEqual({
      up: true,
      right: true,
      down: false,
      left: false,
    });
  });

  it("never wraps across rows or the board edge", () => {
    expect(mergedSides(8, cells(8, 9, 17))).toEqual({
      up: false,
      right: false,
      down: true,
      left: false,
    });
  });
});

describe("concaveCorners", () => {
  it("marks the corner of an L where the diagonal cell is not selected", () => {
    // r1c1 r1c2 over r2c2: r1c2 turns concavely at its bottom-left corner.
    expect(concaveCorners(1, cells(0, 1, 10))).toEqual({
      topLeft: false,
      topRight: false,
      bottomRight: false,
      bottomLeft: true,
    });
    expect(concaveCorners(0, cells(0, 1, 10)).bottomRight).toBe(false);
  });

  it("leaves interior corners of a filled block alone", () => {
    expect(concaveCorners(10, cells(0, 1, 2, 9, 10, 11, 18, 19, 20))).toEqual({
      topLeft: false,
      topRight: false,
      bottomRight: false,
      bottomLeft: false,
    });
  });
});
