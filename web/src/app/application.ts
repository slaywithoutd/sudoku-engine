import type { Repository } from "../storage/repository";
import type { LibraryData } from "../domain/model";
import { createController, type ScreenServices } from "./controller";
import { parseRoute, routeHash } from "./router";
import { mountHome } from "../ui/home";
import { mountLibrary } from "../ui/library";
import { mountCreator } from "../ui/creator";
import { mountPlayer } from "../ui/player";
import { mountSettings } from "../ui/settings";
import { mountSolver } from "../ui/solver";
import { el, button } from "../ui/dom";
import { downloadBackup } from "../ui/backup";
export function mountApplication(
  root: HTMLElement,
  repository: Repository,
  initial: LibraryData,
  initialError?: Error,
): () => void {
  root.replaceChildren();
  const controller = createController(repository, initial),
    services: ScreenServices = {
      controller,
      navigate: (route) => {
        location.hash = routeHash(route);
      },
      newId: () => crypto.randomUUID(),
      now: () => new Date().toISOString(),
    };
  root.classList.add("application");
  const sidebar = el("aside", undefined, "sidebar"),
    brand = button(
      "Sudoku Engine",
      () => services.navigate({ screen: "home" }),
      "brand",
    ),
    nav = el("nav"),
    main = el("main"),
    saveArea = el("div", undefined, "save-area"),
    status = el("span"),
    error = el("p", undefined, "error");
  brand.setAttribute("aria-label", "Sudoku Engine");
  const mark = el("span", "▦", "brand-mark");
  mark.setAttribute("aria-hidden", "true");
  brand.replaceChildren(mark, el("span", "Sudoku Engine", "brand-name"));
  nav.setAttribute("aria-label", "Main navigation");
  const navItems = [
    {
      label: "Home",
      screen: "home",
      path: "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9",
      route: { screen: "home" } as const,
    },
    {
      label: "Library",
      screen: "library",
      path: "M4 4h6v16H4zM14 4h6v16h-6z",
      route: { screen: "library", tab: "puzzles" } as const,
    },
    {
      label: "Settings",
      screen: "settings",
      path: "M4 7h16M4 17h16M9 4v6M15 14v6",
      route: { screen: "settings" } as const,
    },
    { label: "Solver", screen: "solve", path: "M4 4h16v16H4z", route: { screen: "solve" } as const },
  ].map((item) => {
    const control = button(item.label, () => services.navigate(item.route));
    control.setAttribute("aria-label", item.label);
    control.title = item.label;
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(icon.namespaceURI, "path");
    path.setAttribute("d", item.path);
    icon.append(path);
    control.replaceChildren(icon, el("span", item.label));
    nav.append(control);
    return { ...item, control };
  });
  status.dataset.testid = "save-status";
  status.setAttribute("role", "status");
  const retry = button("Retry saving", () => {
      void controller.retry().catch(() => {});
    }),
    backup = button("Export work", () => downloadBackup(services));
  saveArea.append(status, retry, backup, error);
  sidebar.append(
    brand,
    el("p", "YOUR SPACE TO PLAY", "sidebar-caption"),
    nav,
    saveArea,
  );
  root.append(sidebar, main);
  const updateStatus = () => {
    const appearance = controller.snapshot().settings;
    document.documentElement.dataset.mode = appearance.colorMode;
    document.documentElement.dataset.theme = appearance.theme;
    const s = controller.status();
    status.textContent =
      s.kind === "saved"
        ? "Saved"
        : s.kind === "saving"
          ? "Saving…"
          : "Not saved";
    retry.hidden = backup.hidden = error.hidden = s.kind !== "error";
    error.textContent = s.kind === "error" ? s.error.message : "";
  };
  const off = controller.subscribe(updateStatus);
  let dispose = () => {};
  const render = () => {
    dispose();
    document.querySelectorAll("dialog").forEach((d) => d.remove());
    main.replaceChildren();
    const r = parseRoute(location.hash);
    main.classList.toggle(
      "editor-screen",
      r.screen === "create" || r.screen === "play",
    );
    for (const item of navItems) {
      if (item.screen === r.screen)
        item.control.setAttribute("aria-current", "page");
      else item.control.removeAttribute("aria-current");
    }
    switch (r.screen) {
      case "home":
        dispose = mountHome(main, services);
        break;
      case "library":
        dispose = mountLibrary(main, services, r.tab);
        break;
      case "create":
        dispose = mountCreator(main, services, r.id);
        break;
      case "play":
        dispose = mountPlayer(main, services, r.id);
        break;
      case "settings":
        dispose = mountSettings(main, services);
        break;
      case "solve":
        dispose = mountSolver(main, services);
        break;
    }
  };
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (controller.status().kind !== "saved") {
      event.preventDefault();
      event.returnValue = "";
    }
  };
  window.addEventListener("hashchange", render);
  window.addEventListener("beforeunload", beforeUnload);
  render();
  updateStatus();
  if (initialError) controller.update((d) => ({ ...d }));
  return () => {
    off();
    dispose();
    window.removeEventListener("hashchange", render);
    window.removeEventListener("beforeunload", beforeUnload);
    repository.close();
  };
}
