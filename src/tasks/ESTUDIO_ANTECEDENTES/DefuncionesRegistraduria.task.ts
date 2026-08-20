import { createChromeWithVPN, createFreshProfileBrowser } from "../../core/BrowserFactory";
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

        // Esperar a que aparezca alguno de los dos resultados posibles
        const resultLocator = page.locator(Paramas.result);
        const noExistsLocator = page.locator(Paramas.noExists);

        // Esperar hasta que alguno de los dos elementos sea visible
        await Promise.race([
            resultLocator.waitFor({ state: 'visible', timeout: 20000 }).catch(() => null),
            noExistsLocator.waitFor({ state: 'visible', timeout: 20000 }).catch(() => null)
        ]);

        // Pequeña pausa para asegurar que el contenido esté cargado
        await page.waitForTimeout(500);

        // Verificar si el documento no existe
        const noExistsText = await noExistsLocator.textContent().catch(() => '');
        if (noExistsText?.toLowerCase().includes('no existe')) {
            return {
                success: false,
                isDead: false,
                screenshot: (await page.screenshot({ type: 'webp' })).toString('base64')
            };
        }

        // Verificar el resultado de defunción
        const resultText = await resultLocator.textContent().catch(() => '');
        if (resultText?.toLowerCase().includes('muerte')) isDead = true;

        return {
            success: true,
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
