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
import { mountHelp } from "../ui/help";
import { el, button } from "../ui/dom";
import { icon, type IconName } from "../ui/icons";
import { fullscreenButton, isFullscreen, toggleFullscreen } from "../ui/game";
import { comboFromEvent, ignoredTarget } from "../ui/input";
import { updateSetting } from "../ui/settings-sections";
import { downloadBackup } from "../ui/backup";
import logoUrl from "../assets/notpron.png";
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
  const mark = document.createElement("img");
  mark.src = logoUrl;
  mark.alt = "";
  mark.className = "brand-mark";
  brand.replaceChildren(mark, el("span", "Sudoku Engine", "brand-name"));
  nav.setAttribute("aria-label", "Main navigation");
  const navItems = (
    [
      { label: "Home", screen: "home", icon: "home", route: { screen: "home" } },
      { label: "Library", screen: "library", icon: "library", route: { screen: "library", tab: "puzzles" } },
      { label: "Solver", screen: "solve", icon: "solve", route: { screen: "solve" } },
      { label: "Help", screen: "help", icon: "help", route: { screen: "help" } },
      { label: "Settings", screen: "settings", icon: "settings", route: { screen: "settings" } },
    ] as { label: string; screen: string; icon: IconName; route: Parameters<ScreenServices["navigate"]>[0] }[]
  ).map((item) => {
    const control = button("", () => services.navigate(item.route));
    control.setAttribute("aria-label", item.label);
    control.title = item.label;
    control.replaceChildren(icon(item.icon), el("span", item.label));
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
  // App-level controls: they live in the sidebar, outside any single screen,
  // so they behave the same everywhere and survive navigation.
  const tools = el("div", undefined, "sidebar-tools"),
    sidebarToggle = button("", () => setSidebarCollapsed(!controller.snapshot().settings.sidebarCollapsed), "sidebar-toggle"),
    fullscreen = fullscreenButton("sidebar-fullscreen");
  tools.append(sidebarToggle, fullscreen);
  sidebar.append(brand, nav, tools, saveArea);
  root.append(sidebar, main);
  // Entering fullscreen minimizes the sidebar to its rail for more board
  // space; leaving restores it unless the user changed it in between.
  let autoCollapsed = false;
  const setSidebarCollapsed = (collapsed: boolean) => {
    autoCollapsed = false;
    updateSetting(services, "sidebarCollapsed", collapsed);
  };
  const onFocusMode = () => {
    const collapsed = controller.snapshot().settings.sidebarCollapsed;
    if (isFullscreen() && !collapsed) {
      setSidebarCollapsed(true);
      autoCollapsed = true;
    } else if (!isFullscreen() && autoCollapsed) {
      setSidebarCollapsed(false);
    }
  };
  addEventListener("focusmodechange", onFocusMode);
  // Fullscreen is global, so its shortcut works on every screen.
  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.repeat || ignoredTarget(event)) return;
    const combo = comboFromEvent(event);
    if (!combo || combo !== controller.snapshot().settings.shortcuts.fullscreen) return;
    event.preventDefault();
    toggleFullscreen();
  };
  document.addEventListener("keydown", onKey);
  const updateStatus = () => {
    const settings = controller.snapshot().settings;
    applyAppearance(settings);
    const label = settings.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar";
    sidebarToggle.replaceChildren(icon(settings.sidebarCollapsed ? "sidebarOpen" : "sidebarClose"), el("span", label));
    sidebarToggle.setAttribute("aria-label", label);
    sidebarToggle.setAttribute("aria-expanded", String(!settings.sidebarCollapsed));
    sidebarToggle.title = label;
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
    const game = r.screen === "create" || r.screen === "play" || r.screen === "solve";
    main.classList.toggle("editor-screen", game);
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
        dispose = mountSolver(main, services, r.source);
        break;
      case "help":
        dispose = mountHelp(main, services);
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
    removeEventListener("focusmodechange", onFocusMode);
    document.removeEventListener("keydown", onKey);
    repository.close();
  };
}

/** Mirrors appearance and accessibility settings onto <html> for CSS. */
export function applyAppearance(settings: LibraryData["settings"]): void {
  const root = document.documentElement.dataset;
  root.mode = settings.colorMode;
  root.theme = settings.theme;
  root.textScale = String(settings.textScale);
  root.digitScale = String(settings.digitScale);
  root.palette = settings.palette;
  root.boldDigits = String(settings.boldDigits);
  root.contrast = settings.highContrast ? "high" : "normal";
  root.patterns = String(settings.colorPatterns);
  root.motion = settings.reduceMotion ? "reduce" : "auto";
  root.sidebar = settings.sidebarCollapsed ? "collapsed" : "expanded";
}
