/**
 * Outline of a cell selection as one merged shape (SudokuPad style): cells
 * that share an edge fuse into a single region instead of showing up as
 * side-by-side squares, and the outline is drawn once around each region.
 *
 * Pure geometry in cell units (a 9×9 board spans 0…9 on both axes): the
 * board renders the result in an SVG overlay.
 */

type Point = readonly [x: number, y: number];
type Edge = { from: Point; to: Point };

/** Distance the outline keeps from the grid lines, as a fraction of a cell. */
export const OUTLINE_INSET = 0.06;
/** Radius of the outline's outer (convex) corners, as a fraction of a cell. */
export const OUTLINE_RADIUS = 0.12;

const key = ([x, y]: Point) => `${x},${y}`;

/** Clockwise (screen coordinates) boundary edges of the union of the cells. */
function boundaryEdges(selection: ReadonlySet<number>, size: number): Edge[] {
  const has = (row: number, col: number) =>
    row >= 0 && col >= 0 && row < size && col < size && selection.has(row * size + col);
  const edges: Edge[] = [];
  for (const index of selection) {
    const row = Math.floor(index / size),
      col = index % size,
      x0 = col,
      y0 = row,
      x1 = col + 1,
      y1 = row + 1;
    if (!has(row - 1, col)) edges.push({ from: [x0, y0], to: [x1, y0] });
    if (!has(row, col + 1)) edges.push({ from: [x1, y0], to: [x1, y1] });
    if (!has(row + 1, col)) edges.push({ from: [x1, y1], to: [x0, y1] });
    if (!has(row, col - 1)) edges.push({ from: [x0, y1], to: [x0, y0] });
  }
  return edges;
}

const direction = ({ from, to }: Edge): Point => [
  Math.sign(to[0] - from[0]),
  Math.sign(to[1] - from[1]),
];
/** Clockwise quarter turn in screen coordinates (y grows downwards). */
const turnRight = ([dx, dy]: Point): Point => [-dy, dx];
const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];

/**
 * Chains boundary edges into closed loops. Where two selected cells touch
 * only at a corner, the walk turns right so each cell keeps its own loop
 * instead of the two fusing through a single point.
 */
function loops(edges: Edge[]): Point[][] {
  const outgoing = new Map<string, Edge[]>();
  for (const edge of edges) {
    const k = key(edge.from);
    outgoing.set(k, [...(outgoing.get(k) ?? []), edge]);
  }
  const take = (from: Point, heading: Point | undefined): Edge | undefined => {
    const options = outgoing.get(key(from));
    if (!options?.length) return undefined;
    let pick = options[0];
    if (heading && options.length > 1) {
      const right = turnRight(heading);
      pick =
        options.find((e) => same(direction(e), right)) ??
        options.find((e) => same(direction(e), heading)) ??
        options[0];
    }
    options.splice(options.indexOf(pick), 1);
    return pick;
  };
  const result: Point[][] = [];
  for (const start of edges) {
    if (!outgoing.get(key(start.from))?.includes(start)) continue;
    const loop: Point[] = [];
    let edge: Edge | undefined = take(start.from, undefined),
      heading: Point | undefined;
    while (edge) {
      const d = direction(edge);
      // Merge collinear runs so every vertex of the loop is a real corner.
      if (!heading || !same(heading, d)) loop.push(edge.from);
      heading = d;
      edge = same(edge.to, start.from) ? undefined : take(edge.to, heading);
    }
    result.push(loop);
  }
  return result;
}

/** SVG path data for the outline of `selection`, in cell units. */
export function selectionOutlinePath(
  selection: ReadonlySet<number>,
  size = 9,
  inset = OUTLINE_INSET,
  radius = OUTLINE_RADIUS,
): string {
  const parts: string[] = [];
  for (const raw of loops(boundaryEdges(selection, size))) {
    // The walk may have started mid-run, leaving a collinear first vertex.
    const loop = raw.filter((point, i) => {
      const before = raw[(i - 1 + raw.length) % raw.length],
        after = raw[(i + 1) % raw.length];
      return !same(direction({ from: before, to: point }), direction({ from: point, to: after }));
    });
    const n = loop.length;
    // Shift every edge inwards by `inset`; a corner is where the two shifted
    // edges meet, which works the same for convex and concave corners.
    const corners = loop.map((point, i) => {
      const before = loop[(i - 1 + n) % n],
        after = loop[(i + 1) % n],
        dIn = direction({ from: before, to: point }),
        dOut = direction({ from: point, to: after }),
        nIn = turnRight(dIn),
        nOut = turnRight(dOut);
      return {
        x: point[0] + (nIn[0] + nOut[0]) * inset,
        y: point[1] + (nIn[1] + nOut[1]) * inset,
        dIn,
        dOut,
        convex: same(dOut, turnRight(dIn)),
      };
    });
    const fmt = (v: number) => String(Math.round(v * 1000) / 1000);
    const segments = corners.map(({ x, y, dIn, dOut, convex }) => {
      // Only convex corners are rounded; concave ones stay sharp so the
      // outline matches the square inner corners of the cells' own fill.
      const r = convex ? radius : 0;
      const a = [x - dIn[0] * r, y - dIn[1] * r],
        b = [x + dOut[0] * r, y + dOut[1] * r];
      return { start: a, curve: r ? `Q${fmt(x)} ${fmt(y)} ${fmt(b[0])} ${fmt(b[1])}` : "" };
    });
    parts.push(
      segments
        .map(({ start, curve }, i) => `${i ? "L" : "M"}${fmt(start[0])} ${fmt(start[1])}${curve}`)
        .join("") + "Z",
    );
  }
  return parts.join("");
}

/** Which sides of a selected cell touch another selected cell. */
export function mergedSides(
  index: number,
  selection: ReadonlySet<number>,
  size = 9,
): { up: boolean; right: boolean; down: boolean; left: boolean } {
  const row = Math.floor(index / size),
    col = index % size;
  return {
    up: row > 0 && selection.has(index - size),
    down: row < size - 1 && selection.has(index + size),
    left: col > 0 && selection.has(index - 1),
    right: col < size - 1 && selection.has(index + 1),
  };
}
