import { chromium } from 'playwright-extra';
import { firefox as playwrightFirefox } from 'playwright';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import * as path from 'path';

// Aplica el plugin stealth una única vez (solo para chromium, no es compatible con Firefox)
chromium.use(StealthPlugin());

// Detectar el ejecutable de Chrome/Chromium del sistema
function getSystemChromePath(): string | undefined {
    const possiblePaths = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/snap/bin/chromium',
        // Windows paths
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ];
    
    for (const chromePath of possiblePaths) {
        if (fs.existsSync(chromePath)) {
            return chromePath;
        }
    }
    return undefined;
}

export async function createSimpleBrowser(headless: boolean = false) {

    const launchArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--start-maximized',
    ];

    const executablePath = getSystemChromePath();
    
    let browser;
    try {
        // Intentar con Google Chrome channel primero
        browser = await chromium.launch({ headless: headless, channel: 'chrome', args: launchArgs });
    } catch {
        // Fallback: usar ejecutable del sistema si está disponible
        if (executablePath) {
            browser = await chromium.launch({ headless: headless, executablePath, args: launchArgs });
        } else {
            // Último recurso: dejar que Playwright intente encontrar uno
            browser = await chromium.launch({ headless: headless, args: launchArgs });
        }
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

    // Usar directorio temporal del sistema con ID único para evitar colisiones
    const os = require('os');
    const tmpDir = os.tmpdir();
    const uniqueId = `browser-profile-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const profileDir = path.join(tmpDir, uniqueId);
    fs.mkdirSync(profileDir, { recursive: true });

    const executablePath = getSystemChromePath();

    // Preferir Google Chrome real (mejor score en reCAPTCHA); fallback al Chromium del sistema
    let context;
    try {
        context = await chromium.launchPersistentContext(profileDir, {
            headless: false,
            channel: 'chrome',
            args: launchArgs,
            viewport: null,
        });
    } catch {
        // Fallback: usar ejecutable del sistema si está disponible
        if (executablePath) {
            context = await chromium.launchPersistentContext(profileDir, {
                headless: false,
                executablePath,
                args: launchArgs,
                viewport: null,
            });
        } else {
            context = await chromium.launchPersistentContext(profileDir, {
                headless: false,
                args: launchArgs,
                viewport: null,
            });
        }
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

    const executablePath = getSystemChromePath();

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
        // Fallback: usar ejecutable del sistema si está disponible
        if (executablePath) {
            context = await chromium.launchPersistentContext(profileDir, {
                headless: headless,
                executablePath,
                args: launchArgs,
                viewport: null,
            });
        } else {
            context = await chromium.launchPersistentContext(profileDir, {
                headless: headless,
                args: launchArgs,
                viewport: null,
            });
        }
    }

    const browser = context.browser();

    return { browser, context };
    
}