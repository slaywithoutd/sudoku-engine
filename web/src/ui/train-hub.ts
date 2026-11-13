import type { ScreenServices } from "../app/controller";
import { loadTrainingPack, type TrainingPosition } from "../domain/training-pack";
import {
  categoryLabel,
  categoryOf,
  categoryStats,
  overallStats,
  packCategories,
} from "../domain/training";
import { el, button } from "./dom";
import { icon } from "./icons";
import { updateSetting } from "./settings-sections";
import { startSprint } from "./train";

/** Seconds with one decimal: training times are short. */
export function formatSeconds(ms: number | null): string {
  return ms === null ? "—" : `${(ms / 1000).toFixed(1)} s`;
}
const HISTORY_SHOWN = 50;

/**
 * The Train hub (spec §4.3, §5.3): start a sprint, choose categories, and
 * read the statistics and the recent history. Times compare only within a
 * category, against the player's own history.
 */
export function mountTrainHub(container: HTMLElement, services: ScreenServices): () => void {
  const page = el("div", undefined, "train-page");
  const heading = el("div", undefined, "page-heading");
  const start = button(
    "",
    () => {
      startSprint();
      services.navigate({ screen: "train-run" });
    },
    "primary with-icon",
  );
  start.append(icon("play"), el("span", "Start sprint"));
  // Three minutes of active time, three misses allowed (spec §4.2, T6).
  const timedRun = button("", () => services.navigate({ screen: "train-timed" }), "with-icon");
  timedRun.append(icon("train"), el("span", "Timed run"));
  const actions = el("div", undefined, "actions");
  actions.append(timedRun, start);
  heading.append(el("h1", "Train"), actions);
  page.append(
    heading,
    el(
      "p",
      "Find one correct digit as fast as you can. A wrong digit ends the attempt and resets the streak. Positions come from the engine's checked explanations.",
      "intro",
    ),
  );

  const overall = el("dl", undefined, "train-overall");
  overall.dataset.testid = "train-overall";
  const categories = el("fieldset", undefined, "train-categories");
  categories.append(el("legend", "Categories"));
  const categoryList = el("div", undefined, "train-category-list");
  categories.append(categoryList);
  const statsSection = el("section", undefined, "train-section");
  const statsHeading = el("h2", "By category");
  statsHeading.id = "train-stats-heading";
  statsSection.append(statsHeading);
  const statsTable = el("table", undefined, "train-stats");
  statsTable.setAttribute("aria-labelledby", statsHeading.id);
  statsTable.dataset.testid = "train-stats";
  const statsEmpty = el("p", "No attempts yet.", "empty-note");
  statsSection.append(statsTable, statsEmpty);
  const historySection = el("section", undefined, "train-section");
  historySection.append(el("h2", "Recent attempts"));
  const history = el("ol", undefined, "train-history");
  history.dataset.testid = "train-history";
  const historyEmpty = el("p", "Your attempts appear here.", "empty-note");
  historySection.append(history, historyEmpty);
  page.append(overall, categories, statsSection, historySection);
  container.append(page);

  let positions: readonly TrainingPosition[] = [];
  let disposed = false;
  const counts = () => {
    const result = new Map<string, number>();
    for (const p of positions) result.set(categoryOf(p), (result.get(categoryOf(p)) ?? 0) + 1);
    return result;
  };

  // Category filter: on unless switched off (a new category starts on). Built
  // once per pack so a checkbox keeps focus across renders.
  const checkboxes = new Map<string, HTMLInputElement>();
  const buildCategories = () => {
    const total = counts();
    categoryList.replaceChildren(
      ...packCategories(positions).map((category) => {
        const label = el("label", undefined, "train-category"),
          input = el("input");
        input.type = "checkbox";
        input.addEventListener("change", () => {
          const next = new Set(services.controller.snapshot().settings.trainCategoriesOff);
          if (input.checked) next.delete(category);
          else next.add(category);
          updateSetting(services, "trainCategoriesOff", [...next].sort());
        });
        checkboxes.set(category, input);
        const count = String(total.get(category) ?? 0),
          shown = el("span", count, "count");
        shown.setAttribute("aria-hidden", "true");
        label.append(
          input,
          el("span", categoryLabel(category)),
          shown,
          el("span", ` (${count} positions)`, "sr-only"),
        );
        return label;
      }),
    );
  };
  const render = () => {
    const data = services.controller.snapshot(),
      off = new Set(data.settings.trainCategoriesOff),
      all = packCategories(positions);
    const stats = overallStats(
      data.training,
      positions.length ? new Set(positions.map((p) => p.id)) : undefined,
    );
    overall.replaceChildren(
      ...(
        [
          ["Current streak", stats.streak],
          ["Longest streak", stats.longestStreak],
          ["Positions seen", stats.positionsSeen],
          ["Missed, waiting", stats.missedWaiting],
          ["Best timed run", data.training.runs.best],
        ] as const
      ).flatMap(([term, value]) => {
        const item = el("div");
        item.append(el("dt", term), el("dd", String(value)));
        return [item];
      }),
    );
    for (const [category, input] of checkboxes) input.checked = !off.has(category);
    start.disabled = !positions.length || all.every((category) => off.has(category));
    timedRun.disabled = start.disabled;
    // Statistics per category.
    const rows = categoryStats(data.training);
    statsEmpty.hidden = rows.length > 0;
    statsTable.hidden = !rows.length;
    const head = el("thead"),
      headRow = el("tr");
    for (const title of ["Category", "Attempts", "Accuracy", "Best", "Median (last 20)"])
      headRow.append(el("th", title));
    head.append(headRow);
    const body = el("tbody");
    for (const row of rows) {
      const tr = el("tr");
      tr.dataset.category = row.category;
      tr.append(
        el("th", categoryLabel(row.category)),
        el("td", String(row.attempts)),
        el("td", row.accuracy === null ? "—" : `${Math.round(row.accuracy * 100)}%`),
        el("td", formatSeconds(row.bestMs)),
        el("td", formatSeconds(row.medianMs)),
      );
      body.append(tr);
    }
    statsTable.replaceChildren(head, body);
    // History, newest first.
    const recent = [...data.training.attempts].reverse().slice(0, HISTORY_SHOWN);
    historyEmpty.hidden = recent.length > 0;
    history.replaceChildren(
      ...recent.map((attempt) => {
        const item = el("li", undefined, `train-history-item ${attempt.result}`);
        const result = attempt.result === "correct" ? "Correct" : "Missed",
          when = new Date(attempt.at).toLocaleString("en", {
            dateStyle: "medium",
            timeStyle: "short",
          }),
          time = el("time", when, "when");
        time.dateTime = attempt.at;
        const study = button(
          "Study",
          () => services.navigate({ screen: "train-study", id: attempt.position }),
          "ghost",
        );
        study.setAttribute(
          "aria-label",
          `Study: ${result}, ${categoryLabel(attempt.category)}, ${formatSeconds(attempt.ms)}, ${when}`,
        );
        item.append(
          el("span", result, "result"),
          el("span", categoryLabel(attempt.category), "category"),
          el("span", formatSeconds(attempt.ms), "time"),
          time,
          study,
        );
        return item;
      }),
    );
  };
  void loadTrainingPack()
    .then((pack) => {
      if (disposed) return;
      positions = pack.positions;
      buildCategories();
      render();
    })
    .catch((error: Error) => {
      if (!disposed) categoryList.replaceChildren(el("p", error.message, "error"));
    });
  render();
  const off = services.controller.subscribe(render);
  return () => {
    disposed = true;
    off();
  };
}
