import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { pdf } from 'pdf-to-img';
import sharp from 'sharp';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

import Paramas, { RegistraduriaCertificadoResponse } from "../../params/ESTUDIO_ANTECEDENTES/RegistraduriaCertificadoCedulaDeCiudadania.params";
import { createChromeWithVPN } from "../../core/BrowserFactory";

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
    const pdfDocument = await pdf(pdfPath, {
        scale: 4,
        docInitParams: {
            useSystemFonts: true
        }
    });

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

/**
 * Extrae la fecha de afectación del certificado
 * @param base64Image Imagen del certificado en base64
 * @returns Fecha de afectación en formato dd/mm/aaaa
 */
async function extraerFechaAfectacion(pdfPath: string): Promise<string | null> {
    const pdfBuffer = await fs.readFile(pdfPath);

    const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(pdfBuffer),
    });

    const pdfDocument = await loadingTask.promise;
    const page = await pdfDocument.getPage(1);
    const textContent = await page.getTextContent();

    const text = textContent.items
        .map((item: any) => item.str)
        .join(' ');

    return parseFechaAfectacion(text);
}

/**
 * Parsea la fecha de afectación del texto extraído
 * @param text Texto extraído del certificado
 * @returns Fecha de afectación en formato dd/mm/aaaa
 */
function parseFechaAfectacion(text: string): string | null {
    // Permite que "Fecha de Afectación" tenga espacios entre cada letra
    const etiquetaFlexible = /F\s*e\s*c\s*h\s*a\s*d\s*e\s*A\s*f\s*e\s*c\s*t\s*a\s*c\s*i\s*[oó]\s*n/i;
    const idx = text.search(etiquetaFlexible);

    if (idx === -1) {
        console.log('No se encontró la etiqueta "Fecha de Afectación" en el texto OCR');
        return null;
    }

    const resto = text.slice(idx);
    const fechaMatch = resto.match(/(\d\s?\d)\s*\/\s*(\d\s?\d)\s*\/\s*(\d\s?\d\s?\d\s?\d)/);

    if (!fechaMatch) {
        console.log('Se encontró la etiqueta pero no una fecha cerca');
        return null;
    }

    const limpiar = (s: string) => s.replace(/\s/g, '');
    return `${limpiar(fechaMatch[1])}/${limpiar(fechaMatch[2])}/${limpiar(fechaMatch[3])}`;
}

/**
 * Ejecuta el proceso de obtención del certificado de registraduría
 * @param documentNumber Número de documento de identidad
 * @param expDay Día de expedición
 * @param expMonth Mes de expedición
 * @param expYear Año de expedición
 * @returns Respuesta con el certificado en base64
 */
export async function run(
    { documentNumber, expDay, expMonth, expYear }: { documentNumber: string; expDay: string; expMonth: string; expYear: string }
): Promise<RegistraduriaCertificadoResponse> {

    const { context } = await createChromeWithVPN();

    // Con perfil persistente ya hay una página abierta, usarla o crear una nueva
    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    let isDead = false;
    let fechaAfectacion = null;

    try {

        await page.goto('https://certvigenciacedula.registraduria.gov.co/Datos.aspx', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        // Se commpleta el formulario con la información
        await page.fill(Paramas.documentNumber, documentNumber);
        await page.selectOption(Paramas.expDay, expDay);
        await page.selectOption(Paramas.expMonth, expMonth);
        await page.selectOption(Paramas.expYear, expYear);

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
            return {
                success: false,
                message: 'Se alcanzó el máximo de intentos para resolver el captcha'
            };
        } else {
            console.log('Captcha resuelto correctamente.');
        }

        // se valida si hay error en la generación del certificado
        if (await page.locator(Paramas.errorMessage).isVisible()) {
            const errorMessage = await page.locator(Paramas.errorMessage).textContent();

            // Si no es por muerte, mostrar el error
            if (errorMessage && !errorMessage.includes('Muerte')) {
                console.log('=== Error al generar el certificado: ' + errorMessage);
                return {
                    success: false,
                    message: errorMessage
                };
            }

            isDead = true;
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

        // Si es muerto, se extrae la fecha de defunción
        if (isDead) fechaAfectacion = await extraerFechaAfectacion(pdfPath);

        // Se elimina el archivo PDF descargado
        await fs.unlink(pdfPath);

        // Se muestra el certificado en base64 (formato WebP)
        return {
            success: true,
            message: 'Certificado generado correctamente',
            screenshot: base64,
            isDead: isDead,
            deadDate: fechaAfectacion
        };

    } catch (error) {
        console.error('Error durante la ejecución:', error);
        return {
            success: false,
            message: 'Error durante la ejecución'
        };
    } finally {
        await context.close();
    }

}

// run({
//     documentNumber: "21266308",
//     expDay: "11",
//     expMonth: "02",
//     expYear: "1959"
// })