import { createRealProfileBrowser } from "../../core/BrowserFactory"
import params from "../../params/CUSTOM/CatalogoVpfeDianPublic.params"
import * as fs from "fs"
import * as path from "path"

export async function run({cufeCode, document, profileIndex, setup}: {cufeCode: string, document: string, profileIndex?: number, setup?: boolean}): Promise<string | false> {

    const { browser, context } = await createRealProfileBrowser(false, profileIndex)

    // Modo configuración: solo abre el navegador con su perfil para ajustes
    // manuales (instalar extensión, etc.) y se cierra a los 10 minutos
    if (setup) {
        await context.newPage();
        console.log(`Modo configuración: perfil ${profileIndex ?? 'base'} abierto. Se cerrará en 20 minutos...`);
        await new Promise(r => setTimeout(r, 20 * 60 * 1000));
        await context.close();
        await browser?.close();
        return false
    }

    const page = await context.newPage();
    let result: string | false = false

    try {
        
        // Completar el formulario inicial
        await page.goto(params.mainPage);
        await page.waitForLoadState('networkidle');

        await page.fill(params.cufeCode, cufeCode);
        await page.fill(params.nitCode, params.complementosNit);

        // Validar 
        if (!await validateResolveCf(page)) throw new Error("No se pudo resolver el captcha")

        // Ingresar
        await page.click(params.btnSearch)
        
        // Descarga del archivo

        if (!await validateResolveCf(page)) throw new Error("No se pudo resolver el captcha")

        // Asegurar que existe el directorio de descarga (funciona en Windows y Linux)
        fs.mkdirSync(params.downloadPath, { recursive: true })

        // Capturar cookies temprano: si el navegador muere al disparar la descarga,
        // el fallback HTTP ya no dependerá del contexto vivo
        const cookies = await context.cookies()
        const cookieHeader = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ')

        // La descarga puede llegar en la página actual o en un popup nuevo
        const downloadPromise = Promise.race([
            page.waitForEvent('download'),
            context.waitForEvent('page').then((popup: any) => popup.waitForEvent('download')),
        ])

        await page.click(params.btnDownload)
        await page.waitForSelector(params.btnConfirmAlert)
        await page.click(params.btnConfirmAlert)

        const download = await downloadPromise
        const downloadUrl = download.url()

        const ext = path.extname(download.suggestedFilename()) || ".pdf"
        const now = new Date()
        const pad = (n: number) => String(n).padStart(2, '0')
        const timestamp = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
        const fileName = `${document}_${timestamp}${ext}`
        const destPath = path.join(params.downloadPath, fileName)

        try {
            await download.saveAs(destPath)
        } catch {
            // Fallback: descarga HTTP con las cookies capturadas antes de la descarga
            // (el navegador puede estar muerto a estas alturas y no pasa nada)
            const response = await fetch(downloadUrl, { headers: { cookie: cookieHeader } })
            if (!response.ok) throw new Error(`Error HTTP ${response.status} descargando ${downloadUrl}`)
            fs.writeFileSync(destPath, Buffer.from(await response.arrayBuffer()))
        }

        // Ruta retornada siempre en formato Windows, sin importar el SO donde corra
        result = `J:\\TI\\Caso UGPP\\RPA DIAN\\${fileName}`

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await context.close();
        await browser?.close();
    }

    return result
}

const validateResolveCf = async (page: any): Promise<boolean> => {
    try {
        await page.waitForFunction(() => {
            const el = document.evaluate("/html/div/span[2]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue
            return el?.textContent?.toUpperCase().includes("SOLVERCF SOLVED")
        }, null, { timeout: 65000, polling: 1000 })
        return true
    } catch {
        return false
    }
}