import { expect,test } from '@playwright/test';
test.beforeEach(async({page})=>{await page.goto('/tests/browser/board.html');});
test('wrap, shifted physical keys, hidden notes and undo use real events',async({page})=>{
  const cell=page.locator('[data-cell-index="0"]');await cell.click();
  await page.keyboard.press('ArrowLeft');await expect(page.locator('[data-cell-index="8"]')).toHaveAttribute('aria-selected','true');
  await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowUp');await expect(page.locator('[data-cell-index="72"]')).toHaveAttribute('aria-selected','true');await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Shift+Digit2');await expect(cell.locator('[data-notes]')).toHaveText('2');
  await page.keyboard.press('5');await expect(cell.locator('[data-value]')).toHaveText('5');await expect(cell.locator('[data-notes]')).toBeHidden();
  await page.keyboard.press('Backspace');await expect(cell.locator('[data-notes]')).toBeVisible();await page.keyboard.press('Control+z');await expect(cell.locator('[data-value]')).toHaveText('5');
});
test('pointer shift, persistent tool, numpad, locked givens and form isolation',async({page})=>{
  const cell=page.locator('[data-cell-index="0"]');await cell.click();await page.getByRole('button',{name:'Número 3',exact:true}).click({modifiers:['Shift']});await expect(cell.locator('[data-notes]')).toHaveText('3');
  await page.getByRole('button',{name:'Notas',exact:true}).click();await page.keyboard.press('Numpad2');await expect(cell.locator('[data-notes]')).toHaveText('23');
  await page.getByRole('button',{name:'Notas',exact:true}).click();await page.keyboard.press('Numpad5');await expect(cell.locator('[data-value]')).toHaveText('5');
  const name=page.getByLabel('Nome');await name.fill('');await name.pressSequentially('123');await name.press('Control+z');await expect(cell.locator('[data-value]')).toHaveText('5');
  const given=page.locator('[data-cell-index="80"]');await given.click();await page.keyboard.press('2');await page.keyboard.press('Delete');await expect(given.locator('[data-value]')).toHaveText('9');
});
test('remount removes listeners; all nine notes fit and conflict feedback is visible',async({page},info)=>{
  await page.getByRole('button',{name:'Remontar',exact:true}).click();const cell=page.locator('[data-cell-index="0"]');await cell.click();
  for(let n=1;n<=9;n++)await page.keyboard.press(`Shift+Digit${n}`);
  await expect(cell.locator('[data-notes]')).toHaveText('123456789');
  expect(await cell.locator('[data-notes]').evaluate(e=>e.scrollWidth<=e.clientWidth&&e.scrollHeight<=e.clientHeight)).toBe(true);
  await page.screenshot({path:info.outputPath('nine-notes.png')});
});
