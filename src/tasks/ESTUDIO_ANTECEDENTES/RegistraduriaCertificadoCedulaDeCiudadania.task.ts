import { createChromeWithVPN } from "../../core/BrowserFactory";
import Paramas from "../../params/ESTUDIO_ANTECEDENTES/RegistraduriaCertificadoCedulaDeCiudadania.params";
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { pdf } from 'pdf-to-img';
import sharp from 'sharp';

// ============================================
// CONFIGURACIÓN DE RUTA DE DESCARGA
// Modifica esta ruta según tus necesidades
// ============================================
const DOWNLOAD_FOLDER = path.join(os.homedir(), 'Downloads'); // Carpeta de descargas por defecto

/**
 * Convierte un PDF a WebP y retorna el buffer
 * @param pdfPath Ruta del archivo PDF
 * @returns Buffer del archivo WebP
 */
async function convertPdfToWebp(pdfPath: string): Promise<Buffer> {
    // Convertir PDF a imagen PNG (solo primera página)
    const pdfDocument = await pdf(pdfPath, { scale: 2 });
    
    let pngBuffer: Buffer | null = null;
    for await (const image of pdfDocument) {
        pngBuffer = Buffer.from(image);
        break; // Solo tomamos la primera página
    }
    
    if (!pngBuffer) {
        throw new Error('No se pudo generar la imagen del PDF');
    }
    
    // Convertir PNG a WebP usando sharp
    const webpBuffer = await sharp(pngBuffer)
        .webp({ quality: 80 })
        .toBuffer();
    
    return webpBuffer;
}

export async function run() {
    
    const { context } = await createChromeWithVPN();
    
    // Con perfil persistente ya hay una página abierta, usarla o crear una nueva
    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    try {
        
        await page.goto('https://certvigenciacedula.registraduria.gov.co/Datos.aspx', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        // Se commpleta el formulario con la información
        await page.fill(Paramas.documentNumber, "1004163783");
        await page.selectOption(Paramas.expDay, "23");
        await page.selectOption(Paramas.expMonth, "01");
        await page.selectOption(Paramas.expYear, "2020");

        // Loop básico para resolver el captcha buscando una opción válida
        let intentos = 0;
        const maxIntentos = 10;
        
        while (await page.locator(Paramas.captchaCode).isVisible() && intentos < maxIntentos) {
            intentos++;
            console.log(`Intento ${intentos}/${maxIntentos}`);            
            await page.fill(Paramas.captchaCode, "LANAP");
            await page.click(Paramas.submitButton);
            await page.waitForTimeout(2000);
        }

        if (intentos >= maxIntentos) {
            console.log('Se alcanzó el máximo de intentos.');
            process.exit(1);
        } else {
            console.log('Captcha resuelto correctamente.');
        }

        // se valida si hay error en la generación del certificado
        if (await page.locator(Paramas.errorMessage).isVisible()) {
            const errorMessage = await page.locator(Paramas.errorMessage).textContent();
            console.log('=== Error al generar el certificado: ' + errorMessage);
            process.exit(1);
        } 

        console.log('=== Certificado generado correctamente ===');

        // Se descarga el certificado y se pasa a base64
        const downloadPromise = page.waitForEvent('download');
        await page.click(Paramas.downloadButton);
        const download = await downloadPromise;
        
        // Guardar el archivo PDF en la carpeta de descarga configurada
        const fileName = download.suggestedFilename();
        const pdfPath = path.join(DOWNLOAD_FOLDER, fileName);
        await download.saveAs(pdfPath);
        
        // Convertir PDF a WebP y luego a base64
        console.log('Convirtiendo PDF a WebP...');
        const webpBuffer = await convertPdfToWebp(pdfPath);
        const base64 = webpBuffer.toString('base64');

        // Se elimina el archivo PDF descargado
        await fs.unlink(pdfPath);

        // Se muestra el certificado en base64 (formato WebP)
        console.log('Certificado convertido a WebP y codificado en base64\n');
        console.log(base64);

        // FIN
        await page.waitForTimeout(20000);

    } catch (error) {
        console.error('Error durante la ejecución:', error);
    } finally {
        await context.close();
    }

}

run()