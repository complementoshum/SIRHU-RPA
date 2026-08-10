import { createFreshProfileBrowser } from "../../core/BrowserFactory";
import AdresParams, { AdresResponse, PersonScrapinng } from "../../params/ADRES/Adres.params";
import Mailer from "../../utils/Mailer.util";

export async function run( {documentNumber, documentType, notify = false}: {documentNumber: string, documentType: string, notify?: boolean} ): Promise<AdresResponse | null> {

    const { browser, context} = await createFreshProfileBrowser();

    const page = await context.newPage();

    try {
        
        await page.goto('https://aplicaciones.adres.gov.co/BDUA_Internet/Pages/ConsultarAfiliadoWeb_2.aspx');

        await page.locator(AdresParams.selectDocumentType).selectOption(documentType);
        await page.locator(AdresParams.inputDocument).fill(documentNumber);
        await page.locator(AdresParams.btnSearch).click();

        // Esperar hasta que se abra una nueva pestaña y obtenerla
        const newPage = await context.waitForEvent('page');

        // Cambiar al focus de la nueva pestaña
        await newPage.bringToFront();

        // Validar si no hay resultados
        const noResults = await newPage.locator(AdresParams.errorNoResults).isVisible();
        
        if (noResults) {
            const personData: PersonScrapinng = {
                names: '',
                lastNames: '',
                department: '',
                city: '',
                epsStatus: '',
                epsName: '',
                epsRegime: '',
                epsStartedDate: '',
                epsPersonType: '',
                screenShot: (await newPage.screenshot({ type: 'webp' })).toString('base64')
            }
            return {
                success: false,
                message: await newPage.locator(AdresParams.errorNoResults).textContent() || 'Error desconocido al consultar la información',
                person: personData
            }
        }

        // Extraer información de la nueva pestaña
        const personData: PersonScrapinng = {
            names: await newPage.locator(AdresParams.names).textContent() || '',
            lastNames: await newPage.locator(AdresParams.lastNames).textContent() || '',
            department: await newPage.locator(AdresParams.department).textContent() || '',
            city: await newPage.locator(AdresParams.city).textContent() || '',
            epsStatus: await newPage.locator(AdresParams.epsStatus).textContent() || '',
            epsName: await newPage.locator(AdresParams.epsName).textContent() || '',
            epsRegime: await newPage.locator(AdresParams.epsRegime).textContent() || '',
            epsStartedDate: await newPage.locator(AdresParams.epsStartedDate).textContent() || '',
            epsPersonType: await newPage.locator(AdresParams.epsPersonType).textContent() || '',
            screenShot: (await newPage.screenshot({ type: 'png' })).toString('base64')
        }

        return {
            success: true,
            message: 'Por favor verifique los resultados de la consulta realizada.',
            person: personData
        }

    } catch (error: any) {
        console.log(error.message)

        await (new Mailer).send({
            to: process.env.ERROR_NOTIFICATION_EMAIL || '',
            subject: 'Error en Automatización ADRES',
            template: 'NOTIFICATIONS/errors.template.html',
            data: {
                processName: 'ADRES - Consulta de Afiliados',
                timestamp: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
                serverName: process.env.SERVER_NAME || 'No especificado',
                errorMessage: error.message || 'Error desconocido',
                errorDetails: JSON.stringify({
                    name: error.name,
                    message: error.message,
                    documentNumber,
                    documentType
                }, null, 2),
                stackTrace: error.stack || 'No disponible',
                additionalContext: `Documento consultado: ${documentType} ${documentNumber}`
            }
        });

        return null;
    } finally {
        await context.close();
        await browser?.close();
    }

}