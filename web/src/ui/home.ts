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
    el("p", "UM ESPAÇO PARA PENSAR", "eyebrow"),
    el("h1", "Um número de cada vez."),
    el(
      "p",
      "Crie seus próprios desafios. Encontre seu ritmo.\nSeu próximo Sudoku começa aqui.",
      "intro",
    ),
  );
  const cards = el("div", undefined, "home-cards");
  const play = button(
    "",
    () => services.navigate({ screen: "library", tab: "puzzles" }),
    "home-card",
  );
  play.setAttribute("aria-label", "Jogar");
  play.append(
    el("span", "01", "card-number"),
    el("h2", "Jogar"),
    el("p", "Abra sua biblioteca e continue de onde parou."),
    el("span", "Minha biblioteca →", "card-link"),
  );
  const create = button("", () => newDraft(services), "home-card");
  create.setAttribute("aria-label", "Criar");
  create.append(
    el("span", "02", "card-number"),
    el("h2", "Criar"),
    el("p", "Monte um clássico, célula por célula, ou cole um puzzle."),
    el("span", "Novo rascunho →", "card-link"),
  );
  const solve = button("Resolver — em breve", () => {}, "home-card future");
  solve.disabled = true;
  cards.append(play, create, solve);
  hero.append(
    cards,
    el(
      "p",
      "Clássico 9 × 9 · Salvo neste navegador · Sem pressa",
      "home-caption",
    ),
  );
  container.append(hero);
  return () => {};
}
