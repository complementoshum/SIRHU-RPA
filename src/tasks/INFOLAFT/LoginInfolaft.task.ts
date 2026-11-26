import { createFreshProfileBrowser } from "../../core/BrowserFactory";
import { fillAngular } from "../../utils/Common.util";

const INFOLAFT_LOGIN_URL: string = 'https://www.infolaftsearch.com/#!/signin';
const LOGGED_IN_SELECTOR: string = 'a.navbar-brand img[alt="Infolaft Search"]';
const LOGIN_BUTTON_XPATH: string = 'xpath=//*[@id="content"]/section/div/div/div[2]/div[1]/div/div/div/div[1]/div/div/section/div[3]/div[1]/a';
const LOGIN_WAIT_MS: number = 20000;
const LOGIN_ATTEMPTS: number = 2;
const BROWSER_ATTEMPTS: number = 3;

// ::: AUX FNT :::
export async function infolaftIsLoggedIn(page: any, timeout: number): Promise<boolean> {
    return page.locator(LOGGED_IN_SELECTOR).first().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
}

async function tryLogin(page: any, user: string, pass: string): Promise<boolean> {
    for (let attempt = 1; attempt <= LOGIN_ATTEMPTS; attempt++) {
        console.log(`Login attempt ${attempt}/${LOGIN_ATTEMPTS}`);
        await fillAngular(page, 'input[ng-model="$ctrl.authRequest.username"]', user);
        await fillAngular(page, 'input[ng-model="$ctrl.authRequest.password"]', pass);
        await page.click(LOGIN_BUTTON_XPATH);
        if (await infolaftIsLoggedIn(page, LOGIN_WAIT_MS)) return true;
    }
    return false;
}

// ::: MAIN FNT :::
export default async function run(): Promise<{ browser: any; context: any, page: any } | null> {

    const INFOLAFT_LOGIN_USR: string = process.env.INFOLAFT_USR || '';
    const INFOLAFT_LOGIN_PASS: string = process.env.INFOLAFT_PASS || '';

    if (!INFOLAFT_LOGIN_USR || !INFOLAFT_LOGIN_PASS) throw new Error('INFOLAFT_USR or INFOLAFT_PASS not found in environment variables');

    // Main loop for browser attempts
    for (let attempt = 1; attempt <= BROWSER_ATTEMPTS; attempt++) {

        console.log(`Browser attempt ${attempt}/${BROWSER_ATTEMPTS}`);
        const { browser, context } = await createFreshProfileBrowser();

        try {

            const page = await context.newPage();
            await page.goto(INFOLAFT_LOGIN_URL);

            if (await tryLogin(page, INFOLAFT_LOGIN_USR, INFOLAFT_LOGIN_PASS)) {
                console.log('Login successful');
                return { browser, context, page };
            }

            console.warn('Login failed, closing browser');
            await context.close();
            await browser?.close();

        } catch (error) {
            await context.close();
            await browser?.close();
            console.error('Login error:', error);
            //TODO: Notify error
        }
    }

    console.error('Could not log in to Infolaft after all attempts');
    return null;
}