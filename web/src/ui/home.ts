import type { ScreenServices } from "../app/controller";
import { createDraft } from "../domain/library";
import { el, button } from "./dom";
export function newDraft(services: ScreenServices): void {
  const id = services.newId();
  services.controller.update((data) => createDraft(data, id, services.now()));
  services.navigate({ screen: "create", id });
}
export function mountHome(
  container: HTMLElement,
  services: ScreenServices,
): () => void {
  const hero = el("section", undefined, "hero");
  hero.append(
    el("p", "A SPACE TO THINK", "eyebrow"),
    el("h1", "One number at a time."),
    el(
      "p",
      "Create your own challenges. Find your rhythm.\nYour next Sudoku starts here.",
      "intro",
    ),
  );
  const cards = el("div", undefined, "home-cards");
  const play = button(
    "",
    () => services.navigate({ screen: "library", tab: "puzzles" }),
    "home-card",
  );
  play.setAttribute("aria-label", "Play");
  play.append(
    el("span", "01", "card-number"),
    el("h2", "Play"),
    el("p", "Open your library and pick up where you left off."),
    el("span", "My library →", "card-link"),
  );
  const create = button("", () => newDraft(services), "home-card");
  create.setAttribute("aria-label", "Create");
  create.append(
    el("span", "02", "card-number"),
    el("h2", "Create"),
    el("p", "Build a classic, cell by cell, or paste a puzzle."),
    el("span", "New draft →", "card-link"),
  );
  const solve = button("", () => services.navigate({screen:"solve"}), "home-card");
  solve.setAttribute("aria-label","Solve");
  solve.append(el("span","03","card-number"),el("h2","Solve"),el("p","Explore a temporary, explained analysis."),el("span","Open solver →","card-link"));
  cards.append(play, create, solve);
  hero.append(
    cards,
    el(
      "p",
      "Classic 9 × 9 · Saved in this browser · Take your time",
      "home-caption",
    ),
  );
  container.append(hero);
  return () => {};
}
