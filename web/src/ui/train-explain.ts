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
 * removed candidates struck through, the placements it leads to.
 */
export function stepOverlay(position: TrainingPosition): BoardOverlay {
  const removed = new Map<number, Set<number>>();
  for (const [cell, digit] of position.removed)
    removed.set(cell, new Set([...(removed.get(cell) ?? []), digit]));
  return {
    area: new Set(position.cells),
    removed,
    placed: new Map(position.targets.map(([cell, digit]) => [cell, digit])),
    focus: new Set([...removed.keys(), ...position.targets.map(([cell]) => cell)]),
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

/**
 * Says the position was found with a technique, never that it requires one:
 * a simpler route may exist outside the engine's catalogue (spec §8).
 */
export function explanationPanel(position: TrainingPosition): HTMLElement {
  const panel = el("div", undefined, "train-explanation");
  panel.dataset.testid = "train-explanation";
  panel.append(el("h3", `Found with ${foundWith(position)}`, "train-technique"));
  const targets = position.targets
    .map(([cell, digit]) => `${cellName(cell)} = ${digit}`)
    .join(", ");
  if (position.kind === "scan")
    panel.append(
      el(
        "p",
        `From the placed digits alone, ${targets} ${position.targets.length > 1 ? "are singles" : "is a single"}.`,
      ),
    );
  else {
    const text = removalText(position);
    panel.append(
      el(
        "p",
        `${text[0].toUpperCase()}${text.slice(1)}. Then ${targets} ${position.targets.length > 1 ? "are singles" : "is a single"}.`,
      ),
    );
  }
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
