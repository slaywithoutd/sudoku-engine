import { expect, test } from "@playwright/test";
import { SOLUTION } from "../fixtures";
import { cell, playString } from "./helpers";
test("valid completion is dismissible and reappears only on a new complete transition", async ({
  page,
}) => {
  await playString(page, SOLUTION.slice(0, 80) + "0");
  await cell(page, 80).click();
  await page.keyboard.press("9");
  await expect(
    page.getByText("Sudoku concluído!", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".completion")).not.toContainText(/únic|perfeit/i);
  await page
    .getByRole("button", { name: "Fechar mensagem", exact: true })
    .click();
  await cell(page, 79).click();
  await expect(page.locator(".completion")).toBeHidden();
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".completion")).toBeVisible();
});
test("full conflicting board stays editable without unsolicited error when highlights are off", async ({
  page,
}) => {
  await playString(page, SOLUTION.slice(0, 80) + "0");
  await cell(page, 80).click();
  await page.keyboard.press("1");
  await expect(page.locator(".completion")).toBeHidden();
  await expect(page.locator(".cell.conflict")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await page.getByLabel("Destacar conflitos durante o jogo").check();
  await page.goBack();
  await expect(cell(page, 80)).toHaveClass(/conflict/);
  await cell(page, 80).click();
  await page.keyboard.press("9");
  await expect(page.locator(".completion")).toBeVisible();
});
