import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { cell, playString, saved } from "./helpers";
async function upload(page: Page, data: unknown) {
  await page
    .getByLabel("Importar backup", { exact: true })
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(data)),
    });
}
test("download and restore skip identical records, copy conflicts, reject invalid input and render names safely", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Criar", exact: true }).click();
  await page.locator('[data-cell-index="0"]').click();
  await page.keyboard.press("5");
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  const promise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar backup", exact: true })
    .click();
  const download = await promise;
  expect(download.suggestedFilename()).toMatch(/^sudoku-backup-.*\.json$/);
  const file = await download.path();
  if (!file) throw new Error("Missing download");
  const data = JSON.parse(await readFile(file, "utf8"));
  await page.getByLabel("Importar backup", { exact: true }).setInputFiles(file);
  await expect(page.getByRole("dialog")).toContainText("1 ignorados");
  await page
    .getByRole("button", { name: "Aplicar importação", exact: true })
    .click();
  const draft = Object.values(data.data.drafts)[0] as any;
  draft.name = "<img src=x onerror=alert(1)>";
  await upload(page, data);
  await expect(page.getByRole("dialog")).toContainText("1 cópias");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await upload(page, data);
  await page
    .getByRole("button", { name: "Aplicar importação", exact: true })
    .click();
  await expect(page.getByTestId("save-status")).toHaveText("Salvo");
  data.version = 2;
  await upload(page, data);
  await expect(page.getByRole("alert")).toContainText("não suportado");
  await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
  await page.getByRole("button", { name: "Rascunhos", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  await expect(
    page.getByText("<img src=x onerror=alert(1)>", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("main img")).toHaveCount(0);
});
test("restore settings is opt-in and malformed data never partially imports", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  const data = {
    format: "sudoku-engine-backup",
    version: 1,
    exportedAt: "2026-09-12T12:00:00.000Z",
    data: {
      formatVersion: 1,
      revision: 0,
      drafts: {},
      puzzles: {},
      sessions: {},
      settings: { showConflicts: true, language: "pt-BR" },
    },
  };
  await upload(page, data);
  await page
    .getByRole("button", { name: "Aplicar importação", exact: true })
    .click();
  await expect(
    page.getByLabel("Destacar conflitos durante o jogo"),
  ).not.toBeChecked();
  await upload(page, data);
  await page.getByLabel("Restaurar configurações do backup").check();
  await page
    .getByRole("button", { name: "Aplicar importação", exact: true })
    .click();
  await expect(
    page.getByLabel("Destacar conflitos durante o jogo"),
  ).toBeChecked();
  await upload(page, {
    ...data,
    data: { ...data.data, sessions: { missing: {} } },
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByLabel("Destacar conflitos durante o jogo"),
  ).toBeChecked();
});
test("conflicting session restore copies its puzzle branch and preserves hidden notes and redo", async ({
  page,
}) => {
  await playString(page, "0".repeat(81));
  await cell(page, 0).click();
  await page.keyboard.press("Shift+Digit2");
  await page.keyboard.press("5");
  await page.keyboard.press("Control+z");
  await saved(page);
  const url = page.url();
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  const promise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar backup", exact: true })
    .click();
  const file = await (await promise).path();
  if (!file) throw new Error("Missing download");
  await page.goto(url);
  await cell(page, 0).click();
  await page.keyboard.press("Control+y");
  await saved(page);
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await page.getByLabel("Importar backup", { exact: true }).setInputFiles(file);
  await expect(page.getByRole("dialog")).toContainText("3 cópias");
  await page
    .getByRole("button", { name: "Aplicar importação", exact: true })
    .click();
  await saved(page);
  await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Continuar", exact: true })
    .last()
    .click();
  await expect(cell(page, 0).locator("[data-notes]")).toHaveText("2");
  await cell(page, 0).click();
  await page.keyboard.press("Control+y");
  await expect(cell(page, 0).locator("[data-value]")).toHaveText("5");
  await page.keyboard.press("Delete");
  await expect(cell(page, 0).locator("[data-notes]")).toHaveText("2");
});
test("a save completing under a restore preview requires an updated summary acknowledgement", async ({
  page,
}) => {
  await page.goto("/tests/browser/failure.html");
  await page
    .getByRole("button", { name: "Permitir gravação de teste", exact: true })
    .click();
  await page.getByRole("button", { name: "Criar", exact: true }).click();
  await saved(page);
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Pausar gravação de teste", exact: true })
    .click();
  await page.getByLabel("Destacar conflitos durante o jogo").check();
  await upload(page, {
    format: "sudoku-engine-backup",
    version: 1,
    exportedAt: "2026-09-12T12:00:00.000Z",
    data: {
      formatVersion: 1,
      revision: 0,
      drafts: {},
      puzzles: {},
      sessions: {},
      settings: { showConflicts: false, language: "pt-BR" },
    },
  });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.locator("#release").evaluate((e: HTMLButtonElement) => e.click());
  await saved(page);
  await page
    .getByRole("button", { name: "Aplicar importação", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("A biblioteca mudou");
  await page
    .getByRole("button", { name: "Aplicar importação", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByLabel("Destacar conflitos durante o jogo"),
  ).toBeChecked();
});
