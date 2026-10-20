import { Locator } from "patchright";
import { createRealProfileBrowser, createSimpleBrowser } from "../../core/BrowserFactory";
import RuntParams from "../../params/ESTUDIO_ANTECEDENTES/Runt.params";
import { extractCaptchaText, setValueMatSelect } from "../../utils/Common.util";

export interface RuntCategoria {
    categoria: string;
    fechaExpedicion: string;
    fechaVencimiento: string;
    categoriaAntigua: string;
}

export interface RuntLicencia {
    numeroLicencia: string;
    otExpide: string;
    fechaExpedicion: string;
    estado: string;
    restricciones: string;
    retencion: string;
    otCancelaSuspende: string;
    acciones: string;
    categorias: RuntCategoria[];
}

async function cellText(row: Locator, column: string): Promise<string> {
    return (await row.locator(`td.mat-column-${column}`).textContent())?.trim() ?? ''
}

async function waitForVisible(locator: Locator, timeout: number): Promise<boolean> {
    try {
        await locator.waitFor({ state: 'visible', timeout })
        return true
    } catch (error) {
        if (error instanceof Error && error.name === 'TimeoutError') return false
        throw error
    }
}

export async function run({documentType, documentNumber, firtslastName}: {documentType: string, documentNumber: string, firtslastName: string}): Promise<RuntLicencia[] | null> {

    const { browser, context } = await createRealProfileBrowser();
    const page = await context.newPage();

    try {
        
        const url = 'https://portalpublico.runt.gov.co/#/consulta-ciudadano-documento/consulta/consulta-ciudadano-documento'
        await page.goto(url)

        // :: CONSULTA INICIAL ::
        const maxAttempts = 5
        const captchaError = page.locator(RuntParams.captchaError).filter({ hasText: 'El captcha no es valido.' })
        const noLicenseMessage = page.locator(RuntParams.noLicenseMessage).first()

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            if (attempt > 1) await page.goto(url)

            // Esperar que sean visible al menos un elemento
            await page.waitForSelector(RuntParams.documentNumber, { timeout: 60000 })

            // Completar el documento
            await page.fill(RuntParams.documentNumber, documentNumber)
            await page.fill(RuntParams.firtsLastName, firtslastName)
            await setValueMatSelect(page, RuntParams.documentType, documentType)

            // Resolver captcha con OCR y reintentos
            const captchaText = await extractCaptchaText(page.locator(RuntParams.captchaImage), { maxLength: 5 })

            if (!captchaText) {
                if (attempt === maxAttempts) throw new Error('No se pudo leer el captcha')
                continue
            }

            await page.fill(RuntParams.captchaCodeInput, captchaText)
            await page.locator(RuntParams.submitButton).click()

            const outcome = await Promise.race([
                waitForVisible(captchaError, 30000).then(visible => visible ? 'invalidCaptcha' : null),
                waitForVisible(noLicenseMessage, 30000).then(visible => visible ? 'noLicense' : null),
                waitForVisible(page.locator(RuntParams.licensesExpanded), 30000).then(visible => visible ? 'results' : null)
            ])

            if (outcome === 'invalidCaptcha') {
                await page.locator(RuntParams.captchaErrorDismiss).click()
                await captchaError.waitFor({ state: 'hidden', timeout: 10000 })
                console.log(`Intento ${attempt}/${maxAttempts}: captcha rechazado`)
                if (attempt === maxAttempts) throw new Error(`Captcha rechazado tras ${maxAttempts} intentos`)
                continue
            }
            if (outcome === 'noLicense') return null
            if (outcome !== 'results') throw new Error('No se recibió respuesta de la consulta RUNT')

            break
        }
        
        // :: EXTRAER INFORMACIÓN DE LA(S) LICENCIAS ::
        if (await noLicenseMessage.isVisible()) return null
        await page.locator(RuntParams.licensesExpanded).click()
        const table = page.locator(RuntParams.licensesTable)
        const tableOutcome = await Promise.race([
            waitForVisible(table, 30000).then(visible => visible ? 'table' : null),
            waitForVisible(noLicenseMessage, 30000).then(visible => visible ? 'noLicense' : null)
        ])
        if (tableOutcome !== 'table' || await noLicenseMessage.isVisible()) return null
        const rows = table.locator('tbody tr.mat-row')
        if (!await waitForVisible(rows.first(), 10000) || await noLicenseMessage.isVisible()) return null
        const licencias: RuntLicencia[] = []
        const dialog = page.locator(RuntParams.licenseDetailDialog)
        const detailTable = page.locator(RuntParams.licenseDetailTable)

        for (let index = 0, total = await rows.count(); index < total; index++) {
            const row = rows.nth(index)
            const licencia: RuntLicencia = {
                numeroLicencia: await cellText(row, 'numeroLicencia'),
                otExpide: await cellText(row, 'otExpide'),
                fechaExpedicion: await cellText(row, 'fechaExpedicion'),
                estado: await cellText(row, 'estado'),
                restricciones: await cellText(row, 'restricciones'),
                retencion: await cellText(row, 'retencion'),
                otCancelaSuspende: await cellText(row, 'otCancelaSuspende'),
                acciones: await cellText(row, 'acciones'),
                categorias: []
            }

            await row.locator('td.mat-column-acciones a', { hasText: 'Ver Detalle' }).click()
            await detailTable.waitFor({ state: 'visible', timeout: 30000 })
            const categoryRows = detailTable.locator('tbody tr.mat-row')
            for (let categoryIndex = 0, count = await categoryRows.count(); categoryIndex < count; categoryIndex++) {
                const categoryRow = categoryRows.nth(categoryIndex)
                licencia.categorias.push({
                    categoria: await cellText(categoryRow, 'categoria'),
                    fechaExpedicion: await cellText(categoryRow, 'fechaExpedicion'),
                    fechaVencimiento: await cellText(categoryRow, 'fechaVencimiento'),
                    categoriaAntigua: await cellText(categoryRow, 'categoriaAntigua')
                })
            }

            const closeButton = dialog.getByRole('button', { name: /cerrar|close|salir/i }).first()
            if (await closeButton.isVisible()) await closeButton.click()
            else await page.keyboard.press('Escape')
            await dialog.waitFor({ state: 'hidden', timeout: 10000 })
            licencias.push(licencia)
        }

        return licencias

    } finally {
        await context.close();
        await browser?.close();
    }

}

// run({
//     documentType: 'C',
//     documentNumber: '1152711610',
//     firtslastName: 'RUIZ'
// })
// .then(licencias => console.log(JSON.stringify(licencias, null, 2)))
// .catch(error => {
//     console.error(error)
//     process.exitCode = 1
// })
