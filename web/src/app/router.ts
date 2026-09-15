export type Route =
  | { screen: "home" }
  | { screen: "solve" }
  | { screen: "library"; tab: "drafts" | "puzzles" }
  | { screen: "create"; id: string }
  | { screen: "play"; id: string }
  | { screen: "settings" };
export function parseRoute(hash: string): Route {
  if (hash === "#/solve") return { screen: "solve" };
  if (hash === "#/settings") return { screen: "settings" };
  if (hash === "#/library/drafts" || hash === "#/library/puzzles")
    return {
      screen: "library",
      tab: hash.endsWith("drafts") ? "drafts" : "puzzles",
    };
  const match = /^#\/(create|play)\/([^/]+)$/.exec(hash);
  if (match)
    try {
      const id = decodeURIComponent(match[2]);
      if (id) return { screen: match[1] as "create" | "play", id };
    } catch {
      /* malformed URL */
    }
  return { screen: "home" };
}
export function routeHash(route: Route): string {
  switch (route.screen) {
    case "home":
      return "#/";
    case "settings":
      return "#/settings";
    case "solve":
      return "#/solve";
    case "library":
      return `#/library/${route.tab}`;
    default:
      return `#/${route.screen}/${encodeURIComponent(route.id)}`;
  }
}
