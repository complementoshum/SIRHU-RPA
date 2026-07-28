import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as ProxyChain from 'proxy-chain';
import randomUseragent from 'random-useragent';

chromium.use(StealthPlugin());

export interface BrowserProfile {
    proxyUrl: string;
    userAgent?: string;
    viewport?: { width: number; height: number };
    timezone?: string;
    locale?: string;
    geolocation?: { latitude: number; longitude: number };
}

export async function createStealthBrowser(profile: BrowserProfile) {
    // Anonimiza proxy con autenticación
    const anonymizedProxy = await ProxyChain.anonymizeProxy(profile.proxyUrl);
    const ua = profile.userAgent || randomUseragent.getRandom();

    const browser = await chromium.launch({
        headless: false,
        args: [
            `--proxy-server=${anonymizedProxy}`,
            '--disable-blink-features=AutomationControlled'
        ]
    });

    const context = await browser.newContext({
        userAgent: ua,
        viewport: profile.viewport || { width: 1920, height: 1080 },
        timezoneId: profile.timezone || 'America/New_York',
        locale: profile.locale || 'en-US',
        geolocation: profile.geolocation || { latitude: 40.7128, longitude: -74.0060 },
        permissions: ['geolocation'],
        ignoreHTTPSErrors: true
    });

    // Parches adicionales anti-detección (el plugin stealth ya hace la mayoría)
    await context.addInitScript(() => {
        // ======================================================
        // PARCHES ANTI-DETECCIÓN PLAYWRIGHT
        // ======================================================

        // 1. Ocultar flag principal de WebDriver
        Object.defineProperty(navigator, 'webdriver', { get: () => false });

        // 2. Eliminar propiedades de automatización de la ventana
        delete (window as any).__playwright;
        delete (window as any).__pw_manual;
        delete (window as any).__PW_inspect;
        delete (window as any).__nightmare;
        delete (window as any).__selenium_evaluate;
        delete (window as any).__webdriver_evaluate;
        delete (window as any).__driver_evaluate;
        delete (window as any).__fxdriver_evaluate;
        delete (window as any).__applitools_visual_grid;

        // 3. Navigator.plugins y Navigator.mimeTypes (realistas)
        const makePlugins = () => {
            const pluginArr = [
                { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
                { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
                { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
            ];
            const mimeTypesArr = [
                { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
                { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' },
                { type: 'application/x-nacl', suffixes: '', description: 'Native Client Executable' }
            ];

            const plugins = pluginArr.map(p => {
                const plugin = {
                    ...p,
                    length: 1,
                    item: (i: number) => mimeTypesArr[i] || null,
                    namedItem: (name: string) => mimeTypesArr.find(m => m.type === name) || null,
                    [Symbol.iterator]: function* () { yield mimeTypesArr[0]; }
                };
                return plugin;
            });

            const mimeTypes = mimeTypesArr.map(m => ({
                ...m,
                enabledPlugin: plugins[0],
                [Symbol.iterator]: function* () { yield plugins[0]; }
            }));

            // Sobreescribir propiedades
            Object.defineProperty(navigator, 'plugins', {
                get: () => {
                    const arr: any = plugins.slice();
                    arr.item = (i: number) => arr[i] || null;
                    arr.namedItem = (name: string) => arr.find((p: any) => p.name === name) || null;
                    arr.refresh = () => { };
                    arr[Symbol.iterator] = function* () { for (const p of arr) yield p; };
                    Object.setPrototypeOf(arr, PluginArray.prototype);
                    return arr;
                }
            });

            Object.defineProperty(navigator, 'mimeTypes', {
                get: () => {
                    const arr: any = mimeTypes.slice();
                    arr.item = (i: number) => arr[i] || null;
                    arr.namedItem = (name: string) => arr.find((m: any) => m.type === name) || null;
                    arr[Symbol.iterator] = function* () { for (const m of arr) yield m; };
                    Object.setPrototypeOf(arr, MimeTypeArray.prototype);
                    return arr;
                }
            });
        };
        makePlugins();

        // 4. Navigator.language y languages
        Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

        // 5. Hardware concurrency y deviceMemory
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });

        // 6. Platform y vendor (comunes)
        Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
        Object.defineProperty(navigator, 'vendor', { get: () => 'Google Inc.' });

        // 7. window.chrome (necesario para no ser detectado)
        (window as any).chrome = {
            runtime: {},
            loadTimes: function () { },
            csi: function () { },
            app: {}
        };

        // 8. window.outerWidth/outerHeight (coherentes con inner)
        const updateOuter = () => {
            Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth });
            Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight + 100 }); // barra
        };
        updateOuter();
        window.addEventListener('resize', updateOuter);

        // 9. Screen (availWidth/availHeight ~= innerWidth/innerHeight)
        const screenProto = Object.getPrototypeOf(screen);
        Object.defineProperty(screenProto, 'availWidth', { get: () => window.innerWidth });
        Object.defineProperty(screenProto, 'availHeight', { get: () => window.innerHeight });
        Object.defineProperty(screenProto, 'colorDepth', { get: () => 24 });
        Object.defineProperty(screenProto, 'pixelDepth', { get: () => 24 });

        // 10. Permisos: evitar que navigator.permissions.query delate falta de permisos
        const originalQuery = window.navigator.permissions.query;
        // @ts-ignore
        window.navigator.permissions.query = (parameters: any) => {
            if (parameters.name === 'notifications' || parameters.name === 'midi' || parameters.name === 'camera' || parameters.name === 'microphone') {
                return Promise.resolve({ state: 'prompt', onchange: null } as PermissionStatus);
            }
            return originalQuery(parameters);
        };

        // 11. Canvas fingerprint (ruido sutil)
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function (...args: any) {
            const context = this.getContext('2d');
            if (context) {
                const imageData = context.getImageData(0, 0, this.width, this.height);
                // Agregar ruido mínimo en un pixel aleatorio
                const noise = Math.floor(Math.random() * 3);
                if (imageData.data.length > 10) {
                    imageData.data[0] = imageData.data[0] ^ noise;
                }
                context.putImageData(imageData, 0, 0);
            }
            return originalToDataURL.apply(this, args);
        };

        // 12. WebGL fingerprint (vendor y renderer genéricos)
        const getParameterProxyHandler = {
            apply: function (target: any, ctx: any, args: any) {
                const param = args[0];
                // UNMASKED_VENDOR_WEBGL
                if (param === 37445) {
                    return 'Google Inc. (Intel)';
                }
                // UNMASKED_RENDERER_WEBGL
                if (param === 37446) {
                    return 'ANGLE (Intel, Intel(R) UHD Graphics 620, OpenGL 4.5)';
                }
                return Reflect.apply(target, ctx, args);
            }
        };
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                const getParameter = (gl as any).getParameter;
                (gl as any).getParameter = new Proxy(getParameter, getParameterProxyHandler);
            }
        } catch (e) { }

        // 13. AudioContext fingerprint (ruido en el oscilador)
        const originalCreateOscillator = AudioContext.prototype.createOscillator;
        AudioContext.prototype.createOscillator = function (...args: any) {
            const osc = originalCreateOscillator.apply(this, args);
            const originalStart = osc.start;
            osc.start = function (when?: number) {
                // Pequeña variación en frecuencia para distorsionar huella de audio
                if (osc.frequency) {
                    osc.frequency.value = osc.frequency.value + (Math.random() - 0.5) * 0.0001;
                }
                return originalStart.call(this, when);
            };
            return osc;
        };

        // 14. Ocultar "Headless" en userAgent (ya lo haces con el contexto, pero refuerzo)
        Object.defineProperty(navigator, 'userAgent', {
            get: () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });

        // 15. Deshabilitar detección de "AutomationControlled" en modo headless (flags de chrome)
        // (ya se hace con args, pero asegurar)
        if (navigator.webdriver) {
            // Fallback
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        }
    });

    return { browser, context, anonymizedProxy };
}

export async function createSimpleBrowser(){

    // Chrome con playwright en full screen
    const browser = await chromium.launch({
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--start-maximized',
        ]
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: null,
    });

    return { browser, context };
    
}