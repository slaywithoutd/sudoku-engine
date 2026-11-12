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
const same = (first: Point, second: Point) => first[0] === second[0] && first[1] === second[1];

/**
 * Chains boundary edges into closed loops. Where two selected cells touch
 * only at a corner, the walk turns right so each cell keeps its own loop
 * instead of the two fusing through a single point.
 */
function loops(edges: Edge[]): Point[][] {
  const outgoing = new Map<string, Edge[]>();
  for (const edge of edges) {
    const vertex = key(edge.from);
    outgoing.set(vertex, [...(outgoing.get(vertex) ?? []), edge]);
  }
  const take = (from: Point, heading: Point): Edge | undefined => {
    const options = outgoing.get(key(from));
    if (!options?.length) return undefined;
    const right = turnRight(heading);
    const pick =
      options.find((option) => same(direction(option), right)) ??
      options.find((option) => same(direction(option), heading)) ??
      options[0];
    options.splice(options.indexOf(pick), 1);
    return pick;
  };
  const result: Point[][] = [];
  for (const start of edges) {
    if (!outgoing.get(key(start.from))?.includes(start)) continue;
    // The start edge stays available while walking: the loop closes when the
    // turn rule picks it again, not merely when the walk revisits its vertex,
    // which a region pinched at a diagonal does before its loop is complete.
    const loop: Point[] = [];
    let edge: Edge | undefined = start,
      heading: Point | undefined;
    while (edge) {
      const step = direction(edge);
      // Merge collinear runs so every vertex of the loop is a real corner.
      if (!heading || !same(heading, step)) loop.push(edge.from);
      heading = step;
      edge = take(edge.to, heading);
      if (edge === start) edge = undefined;
    }
    result.push(loop);
  }
  return result;
}

const format = (value: number) => String(Math.round(value * 1000) / 1000);

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
    const count = loop.length;
    // Shift every edge inwards by `inset`; a corner is where the two shifted
    // edges meet, which works the same for convex and concave corners.
    const corners = loop.map((point, i) => {
      const before = loop[(i - 1 + count) % count],
        after = loop[(i + 1) % count],
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
    const segments = corners.map(({ x, y, dIn, dOut, convex }) => {
      // Only convex corners are rounded; concave ones stay sharp so the
      // outline matches the square inner corners of the cells' own fill.
      const round = convex ? radius : 0;
      const enter = [x - dIn[0] * round, y - dIn[1] * round],
        leave = [x + dOut[0] * round, y + dOut[1] * round];
      return {
        start: enter,
        curve: round ? `Q${format(x)} ${format(y)} ${format(leave[0])} ${format(leave[1])}` : "",
      };
    });
    parts.push(
      segments
        .map(
          ({ start, curve }, i) =>
            `${i ? "L" : "M"}${format(start[0])} ${format(start[1])}${curve}`,
        )
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

/**
 * Corners of a selected cell where the merged region turns concavely: both
 * sides meeting at the corner touch selected cells but the diagonal cell is
 * not selected. The outline cuts across such a corner by OUTLINE_INSET, so a
 * cell that tints itself must leave that small square out too.
 */
export function concaveCorners(
  index: number,
  selection: ReadonlySet<number>,
  size = 9,
): { topLeft: boolean; topRight: boolean; bottomRight: boolean; bottomLeft: boolean } {
  const { up, right, down, left } = mergedSides(index, selection, size);
  return {
    topLeft: up && left && !selection.has(index - size - 1),
    topRight: up && right && !selection.has(index - size + 1),
    bottomRight: down && right && !selection.has(index + size + 1),
    bottomLeft: down && left && !selection.has(index + size - 1),
  };
}
