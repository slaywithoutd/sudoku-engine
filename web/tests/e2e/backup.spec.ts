import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { cell, playString, saved } from "./helpers";
async function upload(page: Page, data: unknown) {
  await page.getByLabel("Import backup", { exact: true }).setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
}
test("download and restore skip identical records, copy conflicts, reject invalid input and render names safely", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.locator('[data-cell-index="0"]').click();
  await page.keyboard.press("5");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const promise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export backup", exact: true })
    .click();
  const download = await promise;
  expect(download.suggestedFilename()).toMatch(/^sudoku-backup-.*\.json$/);
  const file = await download.path();
  if (!file) throw new Error("Missing download");
  const data = JSON.parse(await readFile(file, "utf8"));
  await page.getByLabel("Import backup", { exact: true }).setInputFiles(file);
  await expect(page.getByRole("dialog")).toContainText("Skipped: 1");
  await page.getByRole("button", { name: "Apply import", exact: true }).click();
  const draft = Object.values(data.data.drafts)[0] as any;
  draft.name = "<img src=x onerror=alert(1)>";
  await upload(page, data);
  await expect(page.getByRole("dialog")).toContainText("Copies: 1");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await upload(page, data);
  await page.getByRole("button", { name: "Apply import", exact: true }).click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  data.version = 2;
  await upload(page, data);
  await expect(page.getByRole("alert")).toContainText("not supported");
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "Drafts", exact: true }).click();
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
  await page.getByRole("button", { name: "Settings", exact: true }).click();
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
  await page.getByRole("button", { name: "Apply import", exact: true }).click();
  await expect(
    page.getByLabel("Highlight conflicts during play"),
  ).not.toBeChecked();
  await upload(page, data);
  await page.getByLabel("Restore settings from backup").check();
  await page.getByRole("button", { name: "Apply import", exact: true }).click();
  await expect(
    page.getByLabel("Highlight conflicts during play"),
  ).toBeChecked();
  await upload(page, {
    ...data,
    data: { ...data.data, sessions: { missing: {} } },
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByLabel("Highlight conflicts during play"),
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
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const promise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export backup", exact: true })
    .click();
  const file = await (await promise).path();
  if (!file) throw new Error("Missing download");
  await page.goto(url);
  await cell(page, 0).click();
  await page.keyboard.press("Control+y");
  await saved(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Import backup", { exact: true }).setInputFiles(file);
  await expect(page.getByRole("dialog")).toContainText("Copies: 3");
  await page.getByRole("button", { name: "Apply import", exact: true }).click();
  await saved(page);
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Continue", exact: true })
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
    .getByRole("button", { name: "Allow test saves", exact: true })
    .click();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await saved(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Pause test saves", exact: true })
    .click();
  await page.getByLabel("Highlight conflicts during play").check();
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
  await page.getByRole("button", { name: "Apply import", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("The library changed");
  await page.getByRole("button", { name: "Apply import", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByLabel("Highlight conflicts during play"),
  ).toBeChecked();
});
