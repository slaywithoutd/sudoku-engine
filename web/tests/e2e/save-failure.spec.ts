import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("failed saves keep live edits exportable and retry only reports saved after commit", async ({
  page,
}) => {
  await page.goto("/tests/browser/failure.html");
  await page.getByRole("button", { name: "Criar", exact: true }).click();
  await page.locator('[data-cell-index="0"]').click();
  await page.keyboard.press("7");
  await expect(page.getByTestId("save-status")).toHaveText("Não salvo");
  const promise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar trabalho", exact: true })
    .click();
  const download = await promise;
  const file = await download.path();
  if (!file) throw new Error("Missing download");
  const data = JSON.parse(await readFile(file, "utf8"));
  expect(
    (Object.values(data.data.drafts)[0] as any).editor.cells[0].value,
  ).toBe(7);
  await page
    .getByRole("button", { name: "Permitir gravação de teste", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Tentar salvar novamente", exact: true })
    .click();
  await expect(page.getByTestId("save-status")).toHaveText("Salvo");
  await page.reload();
  await expect(page.locator('[data-cell-index="0"] [data-value]')).toHaveText(
    "7",
  );
});
test("unavailable IndexedDB offers an explicit memory session with unsaved recovery", async ({
  page,
}) => {
  await page.addInitScript(() => {
    indexedDB.open = () => {
      throw new DOMException("Storage unavailable", "SecurityError");
    };
  });
  await page.goto("/");
  await expect(
    page.getByText("Não foi possível abrir seus dados", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Continuar sem salvar", exact: true })
    .click();
  await expect(page.getByTestId("save-status")).toHaveText("Não salvo");
  await page.getByRole("button", { name: "Criar", exact: true }).click();
  await page.locator('[data-cell-index="0"]').click();
  await page.keyboard.press("4");
  await expect(page.getByTestId("save-status")).toHaveText("Não salvo");
  await expect(
    page.getByRole("button", { name: "Exportar trabalho", exact: true }),
  ).toBeVisible();
});
