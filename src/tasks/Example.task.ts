import { createFreshProfileBrowser } from '../core/BrowserFactory';

(async () => {

  const { browser, context} = await createFreshProfileBrowser();

  try {
    const page = await context.newPage();
    await page.goto('https://procesojudicial.ramajudicial.gov.co/Justicia21/Administracion/Ciudadanos/frmConsulta');
    
    await page.click('xpath=/html/body/form/div[4]/div/fieldset/div[2]/ul/li[2]/a');
    await page.selectOption('xpath=/html/body/form/div[4]/div/fieldset/div[2]/div[3]/div[2]/div/div[1]/div[1]/select', '1');
    await page.fill('xpath=/html/body/form/div[4]/div/fieldset/div[2]/div[3]/div[2]/div/div[1]/div[2]/input', '1004163783');
    await page.click('xpath=/html/body/form/div[4]/div/fieldset/div[2]/div[4]/div/input[1]');

    await page.waitForTimeout(40000);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await context.close();
    await browser?.close();
  }
})();