import { expect, type Page } from "@playwright/test";
export const cell = (page: Page, index: number) =>
  page.locator(`[data-cell-index="${index}"]`);
export const saved = (page: Page) =>
  expect(page.getByTestId("save-status")).toHaveText("Salvo");
export async function playString(page: Page, text: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Criar", exact: true }).click();
  await page.getByRole("button", { name: "Colar puzzle", exact: true }).click();
  await page.getByLabel("81 células").fill(text);
  await page
    .getByRole("button", { name: "Importar puzzle", exact: true })
    .click();
  await page.getByRole("button", { name: "Finalizar", exact: true }).click();
  await page.getByRole("button", { name: "Jogar agora", exact: true }).click();
}
