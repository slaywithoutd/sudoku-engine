import type { Digit } from "../domain/model";
import { digitsOf, type TrainingPosition } from "../domain/training-pack";
import { foundWith } from "../domain/training";
import type { BoardOverlay } from "./board";
import { el } from "./dom";
import { cellName } from "./solver-copy";

export function candidateDigits(mask: number): Digit[] {
  const result: Digit[] = [];
  for (let d = 1; d <= 9; d++) if (mask & (1 << (d - 1))) result.push(d as Digit);
  return result;
}
/** The position as the run screen shows it: placed digits, and candidates on a technique position. */
export function positionOverlay(position: TrainingPosition): BoardOverlay {
  const values = digitsOf(position.values),
    masks = position.candidates;
  return {
    candidates: masks ? values.map((v, i) => (v ? null : candidateDigits(masks[i]))) : undefined,
    derived: new Set(values.flatMap((v, i) => (v && position.givens[i] === "0" ? [i] : []))),
  };
}

/**
 * The engine's key step after an answer (spec §4.1 step 5, §6 T5, D106),
 * drawn as the Solve screen draws a step: the pattern cells as reasoning, the
 * removed candidates struck through, the placements it leads to. A target
 * cell that also loses candidates keeps showing them, struck through, so the
 * removal stays visible; its placement is in the text. `extra` adds the
 * player's own correct placement on the same terms.
 */
export function stepOverlay(position: TrainingPosition, extra?: [number, number]): BoardOverlay {
  const removed = new Map<number, Set<number>>();
  for (const [cell, digit] of position.removed)
    removed.set(cell, new Set([...(removed.get(cell) ?? []), digit]));
  const placements = extra ? [...position.targets, extra] : position.targets;
  return {
    area: new Set(position.cells),
    removed,
    placed: new Map(placements.filter(([cell]) => !removed.has(cell))),
    focus: new Set([...removed.keys(), ...placements.map(([cell]) => cell)]),
  };
}

/** "Removes 7 from B3, B4 · removes 2 from C1", grouped by digit. */
export function removalText(position: Pick<TrainingPosition, "removed">): string {
  const byDigit = new Map<number, number[]>();
  for (const [cell, digit] of position.removed)
    byDigit.set(digit, [...(byDigit.get(digit) ?? []), cell]);
  return [...byDigit]
    .sort((a, b) => a[0] - b[0])
    .map(([digit, cells]) => `removes ${digit} from ${cells.map(cellName).join(", ")}`)
    .join("; ");
}

/** The step in one sentence: also what a screen reader hears after the answer. */
export function stepText(position: TrainingPosition): string {
  const targets = position.targets
      .map(([cell, digit]) => `${cellName(cell)} = ${digit}`)
      .join(", "),
    single = position.targets.length > 1 ? "are singles" : "is a single";
  if (position.kind === "scan") return `From the placed digits alone, ${targets} ${single}.`;
  const text = removalText(position);
  return `${text[0].toUpperCase()}${text.slice(1)}. Then ${targets} ${single}.`;
}

/**
 * Says the position was found with a technique, never that it requires one:
 * a simpler route may exist outside the engine's catalogue (spec §8).
 */
export function explanationPanel(position: TrainingPosition, headingLevel: 2 | 3 = 3): HTMLElement {
  const panel = el("div", undefined, "train-explanation");
  panel.dataset.testid = "train-explanation";
  panel.append(
    el(headingLevel === 2 ? "h2" : "h3", `Found with ${foundWith(position)}`, "train-technique"),
    el("p", stepText(position)),
  );
  const legend = el("div", undefined, "legend");
  for (const [cls, label] of [
    ["area", "Reasoning"],
    ["focus", "Changed"],
    ["removed", "Eliminated"],
  ] as const) {
    if (cls === "removed" && !position.removed.length) continue;
    const item = el("span", undefined, `legend-item ${cls}`);
    item.append(el("i"), el("span", label));
    legend.append(item);
  }
  panel.append(legend);
  return panel;
}
