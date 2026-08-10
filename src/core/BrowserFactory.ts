import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import * as path from 'path';

// Aplica el plugin stealth una única vez
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
    fs.rmSync(profileDir, { recursive: true, force: true });
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