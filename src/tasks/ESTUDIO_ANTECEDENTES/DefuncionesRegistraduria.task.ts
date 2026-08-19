import { createFreshProfileBrowser } from "../../core/BrowserFactory";
import Paramas, { DefuncionesRegistraduriaResponse } from "../../params/ESTUDIO_ANTECEDENTES/DefuncionesRegistraduria.params";

export async function run(
    { documentNumber }: { documentNumber: string }
): Promise<DefuncionesRegistraduriaResponse | null> {

    const { context } = await createFreshProfileBrowser();

    // Con perfil persistente ya hay una página abierta, usarla o crear una nueva
    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    let isDead = false;

    try {

        await page.goto('https://defunciones.registraduria.gov.co', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        await page.waitForLoadState('networkidle');
        await page.fill(Paramas.documentNumber, documentNumber);
        await page.click(Paramas.searchButton);

        // Esperar a que cargue el resultado
        const result = await page.waitForSelector(Paramas.result, { timeout: 20000 });
        const resultText = await result.textContent();

        if (resultText?.toLocaleLowerCase().includes('muerte')) isDead = true;

        return {
            isDead,
            screenshot: (await page.screenshot({ type: 'webp' })).toString('base64')
        };

    } catch (error) {
        return null;
    } finally {
        await context.close();
        await page.close();
    }
    

}