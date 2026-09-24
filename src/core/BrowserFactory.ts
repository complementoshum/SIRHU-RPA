import { chromium } from 'playwright-extra';
import { chromium as patchrightChromium } from 'patchright';
import { firefox as playwrightFirefox } from 'playwright';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import * as path from 'path';

// Aplica el plugin stealth una única vez (solo para chromium, no es compatible con Firefox)
chromium.use(StealthPlugin());

export async function createSimpleBrowser(headless: boolean = false) {

    const launchArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--start-maximized',
    ];

    let browser;
    try {
        browser = await patchrightChromium.launch({ headless: headless, channel: 'chrome', args: launchArgs });
    } catch {
        browser = await patchrightChromium.launch({ headless: headless, args: launchArgs });
    }

    const context = await browser.newContext({
        viewport: null,
        acceptDownloads: true,
        locale: 'es-CO',
        timezoneId: 'America/Bogota',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    await context.addInitScript(() => {
        delete Object.getPrototypeOf(navigator).webdriver;
        Object.defineProperty(navigator, 'webdriver', {
            get: () => false
        });
    });

    return { browser, context };

}

/**
 * Crea un Chrome usando el perfil real del usuario (cookies/sesiones reales).
 *
 * REQUISITO: Chrome normal debe estar COMPLETAMENTE cerrado antes de ejecutar,
 * ya que Chrome bloquea el directorio de perfil mientras está en ejecución.
 */
export async function createRealProfileBrowser(headless: boolean = false, profileIndex?: number | null) {

    const launchArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--start-maximized',
    ];

    const userDataDir =
        process.env.CHROME_USER_DATA_DIR ??
        path.join(process.cwd(), 'chrome_real' + (profileIndex != null ? '_' + profileIndex : ''));

    if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
        console.log(`Perfil creado (vacío, se poblará al abrir Chrome): ${userDataDir}`);
    }

    const contextOptions = {
        headless,
        args: launchArgs,
        viewport: null,
        acceptDownloads: true,
        locale: 'es-CO',
        timezoneId: 'America/Bogota',
    };

    // Preferir Google Chrome instalado; fallback al Chromium empaquetado de patchright
    let context;
    try {
        context = await patchrightChromium.launchPersistentContext(userDataDir, {
            ...contextOptions,
            channel: 'chrome',
        });
    } catch {
        console.log('Google Chrome no encontrado, usando Chromium empaquetado');
        context = await patchrightChromium.launchPersistentContext(userDataDir, contextOptions);
    }

    await context.addInitScript(() => {
        delete Object.getPrototypeOf(navigator).webdriver;
        Object.defineProperty(navigator, 'webdriver', {
            get: () => false
        });
    });

    const browser = context.browser();

    return { browser, context };

}

export async function createFreshProfileBrowser() {

    const launchArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--start-maximized',
    ];

    // Usar directorio temporal del sistema con ID único para evitar colisiones
    const os = require('os');
    const tmpDir = os.tmpdir();
    const uniqueId = `browser-profile-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const profileDir = path.join(tmpDir, uniqueId);
    fs.mkdirSync(profileDir, { recursive: true });

    // Preferir Google Chrome real (mejor score en reCAPTCHA); fallback al Chromium de Playwright
    let context;
    try {
        context = await chromium.launchPersistentContext(profileDir, {
            headless: false,
            channel: 'chrome',
            args: launchArgs,
            viewport: null,
        });
    } catch {
        context = await chromium.launchPersistentContext(profileDir, {
            headless: false,
            args: launchArgs,
            viewport: null,
        });
    }

    const browser = context.browser();

    return { browser, context };

}

export async function createSimpleFirefoxBrowser(headless: boolean = false) {

    const launchArgs = [
        '-width=1920',
        '-height=1080',
    ];

    const browser = await playwrightFirefox.launch({ headless: headless, args: launchArgs });
    const context = await browser.newContext({
        viewport: null,
    });

    return { browser, context };

}

/**
 * Crea un navegador Chrome con perfil persistente para extensiones de VPN.
 * 
 * PRIMERA VEZ:
 * 1. Ejecuta la tarea - se abrirá Chrome
 * 2. Ve a Chrome Web Store e instala una extensión de VPN (Urban VPN, Browsec, etc.)
 * 3. Configura y activa la VPN
 * 4. La extensión quedará guardada para futuras ejecuciones
 */
export async function createChromeWithVPN(headless: boolean = false) {

    // Perfil persistente en la raíz del proyecto - conserva extensiones entre ejecuciones
    const profileDir = path.join(process.cwd(), 'chrome-vpn-profile');

    // Crear el directorio si no existe
    if (!fs.existsSync(profileDir)) {
        fs.mkdirSync(profileDir, { recursive: true });
    }

    const launchArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--start-maximized',
    ];

    let context;
    try {
        // Intentar usar Google Chrome instalado
        context = await chromium.launchPersistentContext(profileDir, {
            headless: headless,
            channel: 'chrome',
            args: launchArgs,
            viewport: null,
        });
    } catch {
        // Fallback a Chromium de Playwright
        context = await chromium.launchPersistentContext(profileDir, {
            headless: headless,
            args: launchArgs,
            viewport: null,
        });
    }

    const browser = context.browser();

    return { browser, context };

}