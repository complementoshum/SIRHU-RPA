import { createSimpleBrowser } from "../../core/BrowserFactory";
import TwoCaptchaResolver from "../../utils/TwoCaptchaResolver.util";
import params, { STATUS_TO_VALIDATE } from "../../params/ESTUDIO_ANTECEDENTES/PolicíaNacionalConsultaDeAntecedentesJudiciales.params";
import { REQUEST_RESULTS } from "../../params/app.params";

export async function run(
    {documentType, documentNumber}: {documentType: string, documentNumber: string}
) {
    
    const { browser, context } = await createSimpleBrowser();
    const page = await context.newPage();
    const captchaResolver = new TwoCaptchaResolver();

    try {
        
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml');
        
        // Terminos iniciales
        await page.click(params.acceptTerms);
        await page.click(params.acceptTermsBtn);
        
        // Completar el formulario
        await page.fill(params.documentInput, documentNumber);
        await page.selectOption(params.documentTypeSelect, documentType);

        // Resolver captcha
        await captchaResolver.resolveCaptchaV2(page);
        
        // Click en el boton de buscar hasta que se resuelva el captcha
        await page.click(params.searchBtn);

        const screenShot = (await page.screenshot({ type: 'jpeg', timeout: 60000 })).toString('base64');

        // Extraer información
        const name = await page.textContent(params.name);
        const status = await page.textContent(params.status);

        // Resultado
        let result = REQUEST_RESULTS.NO_RESULTS

        if(!name || !status || status.toUpperCase() != STATUS_TO_VALIDATE.NO_RESULTS.toUpperCase()) result = REQUEST_RESULTS.VERIFY_RESULTS

        return {
            status,
            name,
            result,
            screenShot
        }

    } catch (error: any) {

        console.error('Error:', error);
        return null;

    } finally {
        await context.close();
        await browser?.close();
    }

}

(async () => {
    const result = await run({documentType: 'cc', documentNumber: '1004163783'});
    console.log(result);
})()