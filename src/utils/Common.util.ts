import { Locator, Page } from "patchright";
import Tesseract from "tesseract.js";

export async function setValueMatSelect(
  page: Page,
  formControlName: string,
  valor: string
): Promise<void> {
  try {
    const matSelect = page.locator(`mat-select[formcontrolname="${formControlName}"]`).first();
    await matSelect.waitFor({ state: 'visible', timeout: 3000 });
    await matSelect.scrollIntoViewIfNeeded();
    
    try {
      const valorActual = await matSelect.locator('.mat-select-value-text').textContent();
      if (valorActual) {
        const valorActualNormalizado = normalizarTexto(valorActual);
        const valorBuscadoNormalizado = normalizarTexto(valor);
        if (valorActualNormalizado === valorBuscadoNormalizado || 
            valorActualNormalizado.includes(valorBuscadoNormalizado) ||
            valorBuscadoNormalizado.includes(valorActualNormalizado)) {
          return;
        }
      }
    } catch (e) {
      // Continuar
    }
    
    await matSelect.click();
    
    const panelSelectors = [
      '.cdk-overlay-pane mat-option',
      '.mat-select-panel mat-option',
      'mat-option[role="option"]',
      '.cdk-overlay-container mat-option'
    ];
    
    let opcionSelector = '';
    for (const selector of panelSelectors) {
      try {
        await page.locator(selector).first().waitFor({ 
          state: 'visible', 
          timeout: 3000 
        });
        opcionSelector = selector;
        break;
      } catch (e) {
        // Continuar
      }
    }
    
    if (!opcionSelector) {
      throw new Error(`No se pudo encontrar el panel de opciones para ${formControlName}`);
    }
    
    const todasOpciones = await page.locator(opcionSelector).all();
    const textosOpciones = await Promise.all(
      todasOpciones.map(opc => opc.textContent().then(t => t?.trim() || ''))
    );
    
    const valorNormalizado = normalizarTexto(valor);
    
    for (let i = 0; i < todasOpciones.length; i++) {
      const opc = todasOpciones[i];
      const textoOpcion = textosOpciones[i];
      
      if (textoOpcion) {
        const textoNormalizado = normalizarTexto(textoOpcion);
        
        if (textoNormalizado === valorNormalizado || 
            textoNormalizado.includes(valorNormalizado) ||
            valorNormalizado.includes(textoNormalizado)) {
          await opc.scrollIntoViewIfNeeded();
          await opc.click();
          await opc.waitFor({ state: 'hidden' }).catch(() => {});
          return;
        }
      }
    }
    
    try {
      const opcion = page.locator(opcionSelector).filter({
        hasText: new RegExp(valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      }).first();
      
      await opcion.waitFor({ state: 'visible', timeout: 3000 });
      await opcion.scrollIntoViewIfNeeded();
      await opcion.click();
      await opcion.waitFor({ state: 'hidden' }).catch(() => {});
      return;
    } catch (e) {
      // Continuar
    }
    
    throw new Error(
      `No se encontró la opción "${valor}" en ${formControlName}. Opciones disponibles: ${textosOpciones.join(', ')}`
    );
    
  } catch (error) {
    console.log(`Error al seleccionar ${formControlName} con valor "${valor}": ${error instanceof Error ? error.message : 'Error desconocido'}`);
    throw error;
  }
}

export function normalizarTexto(texto: string): string {
  return texto.trim().toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[áàäâ]/g, 'a')
    .replace(/[éèëê]/g, 'e')
    .replace(/[íìïî]/g, 'i')
    .replace(/[óòöô]/g, 'o')
    .replace(/[úùüû]/g, 'u');
}

export interface CaptchaOptions {
  lang?: string;
  allowedChars?: string;
  maxLength?: number;
}

/**
 * Extrae texto de una imagen de captcha usando OCR (Tesseract.js)
 * @param imageElement - Locator del elemento de imagen del captcha
 * @param options - Opciones de configuración
 * @returns Texto extraído del captcha (preserva mayúsculas/minúsculas)
 */
export async function extractCaptchaText(
  imageElement: Locator,
  options: CaptchaOptions = {}
): Promise<string> {
  const { 
    lang = 'eng', 
    allowedChars = 'a-zA-Z0-9',
    maxLength = 5
  } = options;

  await imageElement.waitFor({ state: 'visible', timeout: 10000 });
  
  const imageBuffer = await imageElement.screenshot();
  
  const result = await Tesseract.recognize(imageBuffer, lang, {
    logger: () => {},
  });

  let extractedText = result.data.text
    .replace(/\s+/g, '')
    .trim();

  const regex = new RegExp(`[^${allowedChars}]`, 'g');
  extractedText = extractedText.replace(regex, '');

  if (maxLength > 0 && extractedText.length > maxLength) {
    extractedText = extractedText.substring(0, maxLength);
  }

  return extractedText;
}
