import { expect, test } from "vitest";
import { parseRoute, routeHash, type Route } from "../../src/app/router";
test.each([
  "",
  "garbage",
  "#/play/",
  "#/play/%xx",
  "#/library/nope",
  "#/play/a/b",
])("bad route %s falls home", (hash) =>
  expect(parseRoute(hash)).toEqual({ screen: "home" }),
);
test("routes roundtrip encoded identifiers", () => {
  const routes: Route[] = [
    { screen: "home" },
    { screen: "library", tab: "drafts" },
    { screen: "library", tab: "puzzles" },
    { screen: "create", id: "a/b ?" },
    { screen: "play", id: "id" },
    { screen: "settings" },
  ];
  for (const route of routes)
    expect(parseRoute(routeHash(route))).toEqual(route);
});
test("supports the volatile solve route",()=>{
  expect(parseRoute("#/solve")).toEqual({screen:"solve"});
  expect(routeHash({screen:"solve"} as Route)).toBe("#/solve");
});
