import { describe, expect, it } from "vitest";
import { mergedSides, selectionOutlinePath } from "../../src/ui/selection-outline";

const cells = (...indexes: number[]) => new Set(indexes);
const loops = (d: string) => d.split("M").filter(Boolean);
/** Corner points (control points of the Q curves and bare L vertices). */
const corners = (d: string) =>
  [...d.matchAll(/Q([\d.]+) ([\d.]+)|[ML]([\d.]+) ([\d.]+)(?!Q)/g)].map((m) =>
    m[1] !== undefined ? [+m[1], +m[2]] : [+m[3], +m[4]],
  );

describe("selectionOutlinePath", () => {
  it("is empty without a selection", () => {
    expect(selectionOutlinePath(cells())).toBe("");
  });

  it("draws a single inset square for one cell", () => {
    const d = selectionOutlinePath(cells(0), 9, 0.1, 0);
    expect(loops(d)).toHaveLength(1);
    expect(corners(d)).toEqual(
      expect.arrayContaining([
        [0.1, 0.1],
        [0.9, 0.1],
        [0.9, 0.9],
        [0.1, 0.9],
      ]),
    );
    expect(corners(d)).toHaveLength(4);
  });

  it("merges edge-adjacent cells into one rectangle", () => {
    const d = selectionOutlinePath(cells(0, 1, 2), 9, 0.1, 0);
    expect(loops(d)).toHaveLength(1);
    expect(corners(d)).toHaveLength(4);
    expect(corners(d)).toEqual(
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
    const d = selectionOutlinePath(cells(0, 1, 10), 9, 0.1, 0);
    expect(loops(d)).toHaveLength(1);
    expect(corners(d)).toHaveLength(6);
    // The concave corner moves out of the notch, not into a stair step.
    expect(corners(d)).toEqual(expect.arrayContaining([[1.1, 0.9]]));
  });

  it("only rounds convex corners", () => {
    const d = selectionOutlinePath(cells(0, 1, 10), 9, 0.1, 0.05);
    expect((d.match(/Q/g) ?? []).length).toBe(5);
  });

  it("keeps diagonal-only neighbours as separate loops", () => {
    const d = selectionOutlinePath(cells(0, 10), 9, 0.1, 0);
    expect(loops(d)).toHaveLength(2);
    expect(corners(d)).toHaveLength(8);
  });

  it("draws one loop per disconnected region", () => {
    const d = selectionOutlinePath(cells(0, 1, 40, 80), 9, 0.1, 0);
    expect(loops(d)).toHaveLength(3);
  });

  it("handles a ring with a hole", () => {
    // 3×3 block minus its centre
    const d = selectionOutlinePath(cells(0, 1, 2, 9, 11, 18, 19, 20), 9, 0.1, 0);
    expect(loops(d)).toHaveLength(2);
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
