import { Page } from "patchright";
import Mailer from "./Mailer.util";

export default class TwoCaptchaResolver {

    protected apiKey: string = process.env.TWOCAPTCHA_API_KEY || '';
    protected minimumBalance: number = parseFloat(process.env.TWOCAPTCHA_MINIMUM_BALANCE || '0.3');
    protected mainEndpoint: string = process.env.TWOCAPTCHA_API || 'https://api.2captcha.com';

    constructor() {
        if (!this.apiKey) throw new Error('TWOCAPTCHA_API_KEY is not defined');
    }

    /**
     * @description Resolve a reCAPTCHA v2 on the given page using 2Captcha and inject the token
     * @param page
     * @param validate Optional function executed after injecting the token; must return true if the website accepted the captcha. Used to report correct/incorrect to 2Captcha
     * @param timeoutMs Max time to wait for the solution
     * @returns Promise<string> The reCAPTCHA token
     */
    async resolveCaptchaV2(page: Page, validate?: (page: Page) => Promise<boolean>, timeoutMs: number = 180000): Promise<string> {
        
        if (!await this.checkBalance()) throw new Error('Insufficient balance');
        
        const captchaResponseId = 'g-recaptcha-response'

        // Obtener sitekey y si es invisible
        await page.waitForSelector('[data-sitekey], iframe[src*="/recaptcha/"][src*="k="]', { state: 'attached', timeout: 30000 })
            .catch(() => console.warn('reCAPTCHA element not found after waiting, trying ___grecaptcha_cfg'));

        // tsx/esbuild (keepNames) inyecta __name() en funciones serializadas por page.evaluate
        await page.evaluate('window.__name = window.__name || (fn => fn)', undefined, false);

        const { websiteKey, isInvisible } = await page.evaluate(() => {
            const el = document.querySelector<HTMLElement>('[data-sitekey]');
            if (el) return { websiteKey: el.getAttribute('data-sitekey'), isInvisible: el.getAttribute('data-size') === 'invisible' };

            const iframe = document.querySelector<HTMLIFrameElement>('iframe[src*="/recaptcha/"][src*="k="]');
            if (iframe) {
                const params = new URL(iframe.src).searchParams;
                return { websiteKey: params.get('k'), isInvisible: params.get('size') === 'invisible' };
            }

            const findSitekey = (obj: any, depth = 0): string | null => {
                if (!obj || typeof obj !== 'object' || depth > 4) return null;
                for (const key of Object.keys(obj)) {
                    if (key === 'sitekey' && typeof obj[key] === 'string') return obj[key];
                    const found = findSitekey(obj[key], depth + 1);
                    if (found) return found;
                }
                return null;
            };

            const clients = (window as any).___grecaptcha_cfg?.clients;
            const websiteKey = clients ? Object.values(clients).map(c => findSitekey(c)).find(Boolean) || null : null;
            return { websiteKey, isInvisible: false };
        }, undefined, false);

        if (!websiteKey) throw new Error('reCAPTCHA sitekey not found on page');

        // Crear tarea
        const createResponse = await this.apiHelper(this.mainEndpoint + '/createTask', 'POST', {
            task: {
                type: 'RecaptchaV2TaskProxyless',
                websiteURL: page.url(),
                websiteKey,
                isInvisible,
                userAgent: await page.evaluate(() => navigator.userAgent)
            }
        });

        if (!createResponse || createResponse.errorId !== 0) {
            throw new Error(`2Captcha createTask error: ${createResponse?.errorCode || 'unknown'} - ${createResponse?.errorDescription || ''}`);
        }

        const { taskId } = createResponse;

        // Consultar resultado
        const startTime = Date.now();
        let token: string | null = null;

        await new Promise(resolve => setTimeout(resolve, 15000));

        while (Date.now() - startTime < timeoutMs) {
            const result = await this.apiHelper(this.mainEndpoint + '/getTaskResult', 'POST', { taskId });

            if (result && result.errorId !== 0) {
                throw new Error(`2Captcha getTaskResult error: ${result.errorCode} - ${result.errorDescription || ''}`);
            }

            if (result?.status === 'ready') {
                token = result.solution?.gRecaptchaResponse || result.solution?.token;
                break;
            }

            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        if (!token) throw new Error(`2Captcha timeout after ${timeoutMs}ms (taskId: ${taskId})`);

        // Inyectar token y ejecutar callback si existe
        await page.evaluate(({ token, captchaResponseId }) => {
            document.querySelectorAll<HTMLTextAreaElement>(`#${captchaResponseId}, textarea[name="${captchaResponseId}"]`).forEach(textarea => {
                textarea.style.display = 'block';
                textarea.value = token;
                textarea.innerHTML = token;
            });

            const runCallback = (cb: any) => {
                if (typeof cb === 'function') cb(token);
                else if (typeof cb === 'string' && typeof (window as any)[cb] === 'function') (window as any)[cb](token);
            };

            const dataCallback = document.querySelector('[data-sitekey]')?.getAttribute('data-callback');
            if (dataCallback) return runCallback(dataCallback);

            const cfg = (window as any).___grecaptcha_cfg;
            if (!cfg?.clients) return;

            const findCallback = (obj: any, depth = 0): any => {
                if (!obj || typeof obj !== 'object' || depth > 4) return null;
                for (const key of Object.keys(obj)) {
                    if (key === 'callback') return obj[key];
                    const found = findCallback(obj[key], depth + 1);
                    if (found) return found;
                }
                return null;
            };

            Object.values(cfg.clients).forEach(client => runCallback(findCallback(client)));
        }, { token, captchaResponseId }, false);

        // Validar y reportar resultado a 2Captcha
        if (validate) {
            const isValid = await validate(page).catch(error => {
                console.error('Error validating captcha:', error);
                return false;
            });

            if (isValid) await this.reportCorrect(taskId);
            else {
                await this.reportIncorrect(taskId);
                throw new Error(`Captcha rejected by the website (taskId: ${taskId})`);
            }
        }

        return token;

    }

    /**
     * @description Report to 2Captcha that the solution was accepted by the website
     * @param taskId
     * @returns Promise<boolean>
     */
    async reportCorrect(taskId: number): Promise<boolean> {
        console.log(`Reporting correct captcha solution (taskId: ${taskId})`);
        return this.report('reportCorrect', taskId);
    }

    /**
     * @description Report to 2Captcha that the solution was declined by the website (may issue a refund)
     * @param taskId
     * @returns Promise<boolean>
     */
    async reportIncorrect(taskId: number): Promise<boolean> {
        console.log(`Reporting incorrect captcha solution (taskId: ${taskId})`);
        return this.report('reportIncorrect', taskId);
    }

    /**
     * @description Report to 2Captcha the result of the captcha validation
     * @param method 'reportCorrect' or 'reportIncorrect'
     * @param taskId
     * @returns Promise<boolean>
     */
    private async report(method: 'reportCorrect' | 'reportIncorrect', taskId: number): Promise<boolean> {
        const response = await this.apiHelper(`${this.mainEndpoint}/${method}`, 'POST', { taskId });
        const success = response?.errorId === 0 && response?.status === 'success';
        if (!success) console.error(`2Captcha ${method} failed (taskId: ${taskId}):`, response);
        return success;
    }

    /**
     * @description Check if the balance is sufficient
     * @returns Promise<boolean>
     */
    private async checkBalance(): Promise<boolean> {
        try {

            let hasBalance = false;

            const _url = this.mainEndpoint + '/getBalance';
            const response = await this.apiHelper(_url, 'POST');
            const { balance = 0 } = response;
            
            if (balance >= this.minimumBalance) hasBalance = true;

            console.log('Balance: ', balance, 'Minimum balance: ', this.minimumBalance);

            if (!hasBalance) {
                (new Mailer(true)).send({
                    to: process.env.ERROR_NOTIFICATION_EMAIL || '',
                    subject: 'Error en Automatización TwoCaptcha',
                    template: 'NOTIFICATIONS/errors.template.html',
                    data: {
                        processName: 'TwoCaptcha',
                        timestamp: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
                        serverName: process.env.SERVER_NAME || 'No especificado',
                        errorMessage: `<b>Insufficient balance, please add funds to your 2Captcha account.</b><br>Current balance: ${balance}<br>Minimum balance: ${this.minimumBalance}`,
                        errorDetails: JSON.stringify(response, null, 2),
                        stackTrace: 'No disponible',
                        additionalContext: 'TwoCaptcha'
                    }
                });
            }
            
            return hasBalance;
            
        } catch (error) {
            console.error('Error checking balance:', error);
            return false;
        }
    }

    /**
     * @description Helper method to make API calls to 2Captcha
     * @param url 
     * @param method 
     * @param body 
     * @returns Promise<any>
     */
    private async apiHelper(url: string, method: 'GET' | 'POST' = 'GET', body?: any ): Promise<any> {

        try {
            
            if (method === 'POST') body = { ...body, clientKey: this.apiKey };

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: body ? JSON.stringify(body) : undefined
            });

            return await response.json();
            

        } catch (error) {
            console.error('Error in API helper:', error);
            return false;
        }

    }

}