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

    // Interceptar el PDF en el momento que el sitio crea su Blob: la DIAN descarga
    // vía blob: (vive solo en memoria del navegador), así que los bytes se extraen
    // a base64 y se envían a Node de inmediato, aunque la pestaña muera después
    let resolveBlob!: (b64: string) => void
    const blobPromise = new Promise<string>(r => { resolveBlob = r })
    await context.exposeFunction('__rpaSaveBlob', (b64: string) => resolveBlob(b64))
    await context.addInitScript(() => {
        const origCreate = URL.createObjectURL.bind(URL)
        URL.createObjectURL = (obj: any) => {
            if (obj instanceof Blob && obj.type === 'application/pdf') {
                obj.arrayBuffer().then(buf => {
                    const bytes = new Uint8Array(buf)
                    let binary = ''
                    for (let i = 0; i < bytes.length; i += 8192) {
                        binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
                    }
                    (window as any).__rpaSaveBlob(btoa(binary))
                })
            }
            return origCreate(obj)
        }
    })

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

        await page.click(params.btnDownload)
        await page.waitForSelector(params.btnConfirmAlert)
        await page.click(params.btnConfirmAlert)

        // Esperar a que el hook capture el blob del PDF (timeout amplio: con varios
        // navegadores en paralelo todo va más lento)
        const base64 = await Promise.race([
            blobPromise,
            new Promise<string>((_, rej) => setTimeout(() => rej(new Error(`[${document}] Timeout esperando el blob del PDF`)), 180000))
        ])

        const now = new Date()
        const pad = (n: number) => String(n).padStart(2, '0')
        const timestamp = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
        const fileName = `${document}_${timestamp}.pdf`
        const destPath = path.join(params.downloadPath, fileName)

        fs.writeFileSync(destPath, Buffer.from(base64, 'base64'))

        // Ruta retornada siempre en formato Windows, sin importar el SO donde corra
        result = `J:\\TI\\Caso UGPP\\RPA DIAN\\${fileName}`

    } catch (error) {
        console.error('Error:', error);
    } finally {
        // Si Chrome crasheó, close() puede colgarse indefinidamente: se le pone
        // timeout para que la tarea siempre retorne y el registro no quede en V
        await closeWithTimeout(context.close())
        if (browser) await closeWithTimeout(browser.close())
    }

    return result
}

const closeWithTimeout = async (p: Promise<any>, ms = 10000) => {
    try {
        await Promise.race([p, new Promise(r => setTimeout(r, ms))])
    } catch { }
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