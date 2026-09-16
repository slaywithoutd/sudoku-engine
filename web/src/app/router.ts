export type SolveSource = { kind: "puzzle" | "draft"; id: string };
export type Route =
  | { screen: "home" }
  | { screen: "solve"; source?: SolveSource }
  | { screen: "library"; tab: "drafts" | "puzzles" }
  | { screen: "create"; id: string }
  | { screen: "play"; id: string }
  | { screen: "settings" }
  | { screen: "help" };
function decode(value: string): string | undefined {
  try {
    return decodeURIComponent(value) || undefined;
  } catch {
    return undefined; // malformed URL
  }
}
export function parseRoute(hash: string): Route {
  if (hash === "#/solve") return { screen: "solve" };
  if (hash === "#/settings") return { screen: "settings" };
  if (hash === "#/help") return { screen: "help" };
  if (hash === "#/library/drafts" || hash === "#/library/puzzles")
    return {
      screen: "library",
      tab: hash.endsWith("drafts") ? "drafts" : "puzzles",
    };
  const solve = /^#\/solve\/(puzzle|draft)\/([^/]+)$/.exec(hash);
  if (solve) {
    const id = decode(solve[2]);
    return id ? { screen: "solve", source: { kind: solve[1] as SolveSource["kind"], id } } : { screen: "solve" };
  }
  const match = /^#\/(create|play)\/([^/]+)$/.exec(hash);
  if (match) {
    const id = decode(match[2]);
    if (id) return { screen: match[1] as "create" | "play", id };
  }
  return { screen: "home" };
}
export function routeHash(route: Route): string {
  switch (route.screen) {
    case "home":
      return "#/";
    case "settings":
      return "#/settings";
    case "help":
      return "#/help";
    case "solve":
      return route.source ? `#/solve/${route.source.kind}/${encodeURIComponent(route.source.id)}` : "#/solve";
    case "library":
      return `#/library/${route.tab}`;
    default:
      return `#/${route.screen}/${encodeURIComponent(route.id)}`;
  }
}
