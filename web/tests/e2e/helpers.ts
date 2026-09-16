import { expect, type Page } from "@playwright/test";
export const cell = (page: Page, index: number) =>
  page.locator(`[data-cell-index="${index}"]`);
export const saved = (page: Page) =>
  expect(page.getByTestId("save-status")).toHaveText("Saved");
export async function importText(page: Page, text: string, confirm = "Import as new draft"): Promise<void> {
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByLabel("Puzzle text").fill(text);
  await page.getByRole("button", { name: confirm, exact: true }).click();
}
/** Finishes the open draft, confirming the few-clues prompt when it appears. */
export async function finishDraft(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  const anyway = page.getByRole("button", { name: "Finish anyway", exact: true });
  const ready = page.getByRole("button", { name: "Play now", exact: true });
  await expect(anyway.or(ready)).toBeVisible();
  if (await anyway.isVisible()) await anyway.click();
}
export async function playString(page: Page, text: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await importText(page, text);
  await finishDraft(page);
  await page.getByRole("button", { name: "Play now", exact: true }).click();
}
export async function openMenu(page: Page, item: string): Promise<void> {
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
}
export async function openSettings(page: Page): Promise<void> {
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Settings", exact: true })
    .click();
}
export async function openLibrary(page: Page): Promise<void> {
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Library", exact: true })
    .click();
}
