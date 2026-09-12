import { expect, type Page } from "@playwright/test";
export const cell = (page: Page, index: number) =>
  page.locator(`[data-cell-index="${index}"]`);
export const saved = (page: Page) =>
  expect(page.getByTestId("save-status")).toHaveText("Saved");
export async function playString(page: Page, text: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("button", { name: "Paste puzzle", exact: true }).click();
  await page.getByLabel("81 cells").fill(text);
  await page
    .getByRole("button", { name: "Import puzzle", exact: true })
    .click();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "Play now", exact: true }).click();
}
