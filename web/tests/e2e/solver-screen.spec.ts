import {expect,test} from "@playwright/test";
test("opens the temporary English Solve screen",async({page})=>{
  await page.goto("#/" );
  await page.getByRole("button",{name:"Solve",exact:true}).click();
  await expect(page.getByRole("radio",{name:"Explain",exact:true})).toBeChecked();
  await expect(page.getByText("Temporary input and analysis.",{exact:false})).toBeVisible();
  await page.getByRole("button",{name:"Start",exact:true}).click();
  await expect(page.getByText("Solution verification",{exact:true})).toBeVisible();
  expect(await page.getByTestId("solver-result").getByRole("button",{name:"Number 1"}).count()).toBe(0);
});
