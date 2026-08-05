import { Page } from 'playwright';
import { createSimpleBrowser } from '../../core/BrowserFactory';
import MedidasCorrectivasParams from '../../params/ESTUDIO_ANTECEDENTES/MedidasCorrectivas.params';
import { ParserUtil } from '../../utils/Parser.util';
import { RunTaskResponse } from '../../core/TaskRunner';

export interface PersonInterface {
    id: number;
    documentType: string;
    documentNumber: string;
    docuemntExpeditionDate: string;
    firstName: string;
    middleName?: string;
    lastName: string;
    middleLastName?: string;
    email?: string;
}

interface Outcome {
    type: 'name' | 'notification' | 'none';
    message: string | null;
}

const POST_CLICK_TIMEOUT = 15000;
const POLL_INTERVAL = 500;

export async function run(person: PersonInterface): Promise<RunTaskResponse> {
    const {browser, context} = await createSimpleBrowser();

    const page = await context.newPage();
    
    try {
        await page.goto('https://srvcnpc.policia.gov.co/PSC/frm_cnp_consulta.aspx');

        // Seleccionar tipo de documento
        await page.waitForSelector(`#${MedidasCorrectivasParams.documentType}`, { state: 'visible' });
        await page.selectOption(`#${MedidasCorrectivasParams.documentType}`, ParserUtil.SiamoDocumentToMD(person.documentType));

        // Ingresar fecha de expedición solo para cédula de ciudadanía
        if(person.documentType === 'C') {
            await page.waitForSelector(`#${MedidasCorrectivasParams.docuemntExpeditionDate}`, { state: 'visible' });
            await page.fill(`#${MedidasCorrectivasParams.docuemntExpeditionDate}`, person.docuemntExpeditionDate);
        }

        // Ingresar número de documento
        await page.waitForSelector(`#${MedidasCorrectivasParams.documentNumber}`, { state: 'visible' });
        await page.fill(`#${MedidasCorrectivasParams.documentNumber}`, person.documentNumber);

        // Click en el botón de buscar
        await page.waitForSelector(`#${MedidasCorrectivasParams.searBtn}`, { state: 'visible' });
        await page.click(`#${MedidasCorrectivasParams.searBtn}`);

        // Esperar a que aparezca el resultado del nombre o el modal de notificación
        const outcome = await waitForOutcome(page, person.documentType, POST_CLICK_TIMEOUT);

        if (outcome.type === 'name' && outcome.message) {
            return {
                success: true,
                message: `Identidad de la persona validada | Nombre completo consultado: ${outcome.message}`
            };
        }

        if (outcome.type === 'notification' && outcome.message) {
            return {
                success: false,
                message: outcome.message
            };
        }

        return {
            success: false,
            message: 'No se detectó resultado ni notificación dentro del tiempo esperado'
        };
    } finally {
        await browser.close();
    }
}

const waitForOutcome = async (page: Page, documentType: string, timeout: number): Promise<Outcome> => {
    const nameResultSelector = `#${MedidasCorrectivasParams.nameResult}`;
    const notificationModalSelector = `#${MedidasCorrectivasParams.notificationsModal}`;
    const notificationResponseSelector = `#${MedidasCorrectivasParams.notificationResponse}`;

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        // Verificar si apareció el resultado del nombre (solo para cédula)
        if (documentType === 'C') {
            const nameLocator = page.locator(nameResultSelector);
            const nameCount = await nameLocator.count().catch(() => 0);
            const nameVisible = nameCount > 0 ? await nameLocator.isVisible().catch(() => false) : false;
            const nameText = nameVisible
                ? await nameLocator.textContent({ timeout: 500 }).catch(() => null)
                    || await nameLocator.inputValue({ timeout: 500 }).catch(() => null)
                : null;

            if (nameText && nameText.trim()) {
                return { type: 'name', message: nameText.trim() };
            }
        }

        // Verificar si apareció el modal de notificación con un mensaje real
        const notificationVisible = await page.locator(notificationModalSelector).isVisible().catch(() => false);
        const modalMessage = notificationVisible
            ? await page.locator(notificationResponseSelector).textContent({ timeout: 500 }).catch(() => null)
            : null;

        if (modalMessage && modalMessage.trim() && !modalMessage.toLowerCase().includes('procesando')) {
            return { type: 'notification', message: modalMessage.trim() };
        }

        await page.waitForTimeout(POLL_INTERVAL);
    }

    console.warn('No se detectó resultado ni notificación dentro del tiempo esperado');
    return { type: 'none', message: null };
}

