import { expect, test } from "@playwright/test";
import { PUZZLE } from "../fixtures";
test("draft name autosaves while focused and refresh retains it", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByLabel("Draft name").fill("Nome sem sair do campo");
  await expect(page.getByLabel("Draft name")).toBeFocused();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByLabel("Draft name")).toHaveValue(
    "Nome sem sair do campo",
  );
});
test("conflicting draft saves, cannot finish, and playable clues remain locked", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.locator('[data-cell-index="0"]').click();
  await page.keyboard.press("1");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("1");
  await expect(
    page.getByRole("button", { name: "Finish", exact: true }),
  ).toBeDisabled();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Finish", exact: true }),
  ).toBeDisabled();
  await expect(page.locator('[data-cell-index="1"]')).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.locator('[data-cell-index="1"]').click();
  await page.keyboard.press("Backspace");
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "Play now", exact: true }).click();
  await page.locator('[data-cell-index="0"]').click();
  await page.keyboard.press("9");
  await expect(page.locator('[data-cell-index="0"] [data-value]')).toHaveText(
    "1",
  );
  await page.locator('[data-cell-index="1"]').click();
  await page.keyboard.press("1");
  await expect(page.locator(".cell.conflict")).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Highlight conflicts during play").check();
  await page.goBack();
  await expect(page.locator(".cell.conflict")).toHaveCount(2);
});
test("string import preserves current draft; copy and confirmed deletion preserve original progress", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByLabel("Draft name").fill("Meu rascunho");
  await page.getByLabel("Draft name").press("Tab");
  await page.getByRole("button", { name: "Paste puzzle", exact: true }).click();
  await page.getByLabel("81 cells").fill("bad");
  await page
    .getByRole("button", { name: "Import puzzle", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("81 cells");
  await page.getByLabel("81 cells").fill(PUZZLE);
  await page
    .getByRole("button", { name: "Import puzzle", exact: true })
    .click();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "Play now", exact: true }).click();
  await page.locator('[data-cell-index="2"]').click();
  await page.keyboard.press("4");
  const playUrl = page.url();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "Edit copy", exact: true }).click();
  await page.locator('[data-cell-index="0"]').click();
  await page.keyboard.press("9");
  await page.goto(playUrl);
  await expect(page.locator('[data-cell-index="0"] [data-value]')).toHaveText(
    "5",
  );
  await expect(page.locator('[data-cell-index="2"] [data-value]')).toHaveText(
    "4",
  );
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm deletion", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Drafts", exact: true }).click();
  await expect(page.getByText("Meu rascunho", { exact: true })).toBeVisible();
});
