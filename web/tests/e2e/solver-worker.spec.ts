import {expect,test} from "@playwright/test";
test("runs and cancels a real module worker",async({page})=>{
  await page.goto("/tests/browser/solver-worker.html");
  await page.getByRole("button",{name:"Start long proof"}).click();
  await page.getByRole("button",{name:"Cancel"}).click();
  await expect(page.getByRole("status")).toHaveText("Cancelled");
  await expect(page.getByTestId("accepted-step-count")).toHaveText("0");
});
