import { createFreshProfileBrowser } from "../../core/BrowserFactory";
import Mailer from "../../utils/Mailer.util";

export async function run({documentType, documentNumber}: {documentType: string, documentNumber: string}) {
    
    const { browser, context } = await createFreshProfileBrowser();
    const page = await context.newPage();

    try {
        
        await page.goto('https://procesojudicial.ramajudicial.gov.co/Justicia21/Administracion/Ciudadanos/frmConsulta');
        
        await page.click('xpath=/html/body/form/div[4]/div/fieldset/div[2]/ul/li[2]/a');
        await page.selectOption('xpath=/html/body/form/div[4]/div/fieldset/div[2]/div[3]/div[2]/div/div[1]/div[1]/select', documentType);
        await page.fill('xpath=/html/body/form/div[4]/div/fieldset/div[2]/div[3]/div[2]/div/div[1]/div[2]/input', documentNumber);
        await page.click('xpath=//*[@id="MainContent_btnConsultar"]');

        await page.waitForTimeout(40000);

    } catch (error: any) {
        console.error('Error:', error);

        await (new Mailer).send({
            to: process.env.ERROR_NOTIFICATION_EMAIL || '',
            subject: 'Error en Automatización Consulta de Procesos Judiciales TYBA',
            template: 'NOTIFICATIONS/errors.template.html',
            data: {
                processName: 'Consulta de Procesos Judiciales TYBA',
                timestamp: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
                serverName: process.env.SERVER_NAME || 'No especificado',
                errorMessage: error.message || 'Error desconocido',
                errorDetails: JSON.stringify({
                    name: error.name,
                    message: error.message,
                }, null, 2),
                stackTrace: error.stack || 'No disponible',
                additionalContext: 'Consulta de procesos Judiciales TYBA'
            }
        });

        return null;

    } finally {
        await context.close();
        await browser?.close();
    }

}

run({documentType: '1', documentNumber: '1004163783'});