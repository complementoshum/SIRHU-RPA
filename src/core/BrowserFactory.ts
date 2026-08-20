import { chromium } from 'playwright-extra';
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
        browser = await chromium.launch({ headless: headless, channel: 'chrome', args: launchArgs });
    } catch {
        browser = await chromium.launch({ headless: headless, args: launchArgs });
    }

    const context = await browser.newContext({
        viewport: null,
    });

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

    // Perfil persistente en la raíz del proyecto; se borra y recrea en cada llamada
    const profileDir = path.join(process.cwd(), 'browser-profile');
    
    // Eliminar archivos de bloqueo de Chrome que impiden abrir el perfil
    const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
    for (const lockFile of lockFiles) {
        const lockPath = path.join(profileDir, lockFile);
        try {
            fs.rmSync(lockPath, { force: true });
        } catch {
            // Ignorar si no existe
        }
    }
    
    try {
        fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
        // Si falla, continuar con el perfil existente (ya se eliminaron los locks)
        console.warn('No se pudo eliminar el perfil del navegador, continuando con el existente...');
    }
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