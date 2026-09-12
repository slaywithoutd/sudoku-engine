import {expect,test} from '@playwright/test';
import {PUZZLE} from '../fixtures';
test('conflicting draft saves, cannot finish, and playable clues remain locked',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Criar',exact:true}).click();
  await page.locator('[data-cell-index="0"]').click();await page.keyboard.press('1');await page.keyboard.press('ArrowRight');await page.keyboard.press('1');
  await expect(page.getByRole('button',{name:'Finalizar',exact:true})).toBeDisabled();await expect(page.getByTestId('save-status')).toHaveText('Salvo');
  await page.reload();await expect(page.getByRole('button',{name:'Finalizar',exact:true})).toBeDisabled();await expect(page.locator('[data-cell-index="1"]')).toHaveAttribute('aria-selected','true');
  await page.locator('[data-cell-index="1"]').click();await page.keyboard.press('Backspace');await page.getByRole('button',{name:'Finalizar',exact:true}).click();await page.getByRole('button',{name:'Jogar agora',exact:true}).click();
  await page.locator('[data-cell-index="0"]').click();await page.keyboard.press('9');await expect(page.locator('[data-cell-index="0"] [data-value]')).toHaveText('1');
  await page.locator('[data-cell-index="1"]').click();await page.keyboard.press('1');await expect(page.locator('.cell.conflict')).toHaveCount(0);
  await page.getByRole('button',{name:'Configurações',exact:true}).click();await page.getByLabel('Destacar conflitos durante o jogo').check();await page.goBack();await expect(page.locator('.cell.conflict')).toHaveCount(2);
});
test('string import preserves current draft; copy and confirmed deletion preserve original progress',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Criar',exact:true}).click();await page.getByLabel('Nome do rascunho').fill('Meu rascunho');await page.getByLabel('Nome do rascunho').press('Tab');
  await page.getByRole('button',{name:'Colar puzzle',exact:true}).click();await page.getByLabel('81 células').fill('bad');await page.getByRole('button',{name:'Importar puzzle',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('81 células');
  await page.getByLabel('81 células').fill(PUZZLE);await page.getByRole('button',{name:'Importar puzzle',exact:true}).click();await page.getByRole('button',{name:'Finalizar',exact:true}).click();await page.getByRole('button',{name:'Jogar agora',exact:true}).click();
  await page.locator('[data-cell-index="2"]').click();await page.keyboard.press('4');const playUrl=page.url();
  await page.getByRole('button',{name:'Biblioteca',exact:true}).click();await page.getByRole('button',{name:'Editar cópia',exact:true}).click();await page.locator('[data-cell-index="0"]').click();await page.keyboard.press('9');
  await page.goto(playUrl);await expect(page.locator('[data-cell-index="0"] [data-value]')).toHaveText('5');await expect(page.locator('[data-cell-index="2"] [data-value]')).toHaveText('4');
  await page.getByRole('button',{name:'Biblioteca',exact:true}).click();await page.getByRole('button',{name:'Excluir',exact:true}).click();await page.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(page.getByRole('button',{name:'Continuar',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Excluir',exact:true}).click();await page.getByRole('button',{name:'Confirmar exclusão',exact:true}).click();await expect(page.getByRole('button',{name:'Continuar',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Rascunhos',exact:true}).click();await expect(page.getByText('Meu rascunho',{exact:true})).toBeVisible();
});
