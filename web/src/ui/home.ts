import type { ScreenServices } from "../app/controller";
import { createDraft } from "../domain/library";
import { el, button } from "./dom";
import { icon, type IconName } from "./icons";
import { randomSplash } from "./splash";
export function newDraft(services: ScreenServices): void {
  const id = services.newId();
  services.controller.update((data) => createDraft(data, id, services.now()));
  services.navigate({ screen: "create", id });
}
export function mountHome(container: HTMLElement, services: ScreenServices): () => void {
  const hero = el("section", undefined, "hero");
  hero.append(el("h1", "One number at a time."), el("p", randomSplash(), "intro splash"));
  const cards = el("div", undefined, "home-cards");
  const card = (name: string, iconName: IconName, text: string, onClick: () => void) => {
    const node = button("", onClick, "home-card");
    node.setAttribute("aria-label", name);
    const mark = el("span", undefined, "card-icon");
    mark.append(icon(iconName));
    const arrow = el("span", undefined, "card-arrow");
    arrow.append(icon("send"));
    node.append(mark, el("h2", name), el("p", text), arrow);
    return node;
  };
  cards.append(
    card("Play", "play", "Continue a game or start one from your library.", () =>
      services.navigate({ screen: "library", tab: "puzzles" }),
    ),
    card("Create", "pen", "Enter clues or import a puzzle.", () => newDraft(services)),
    card("Solve", "solve", "Analyze a puzzle or step through its logic.", () =>
      services.navigate({ screen: "solve" }),
    ),
  );
  hero.append(cards);
  container.append(hero);
  return () => {};
}
