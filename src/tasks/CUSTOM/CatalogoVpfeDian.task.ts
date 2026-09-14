import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { createRealProfileBrowser } from "../../core/BrowserFactory"
import params, { TBL_DATA_URL, TBL_QUERY_TIMEOUT, MAIN_URL, SECONDARY_URL } from "../../params/CUSTOM/CatalogoVpfeDian.params"

// Ruta multiplatform (Windows/Linux)
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR ?? path.join(os.homedir(), 'Downloads', 'TEST');
const PROGRESS_FILE = path.join(process.cwd(), 'catalogo_progress.txt');

interface Progress {
    lastPage: number;
    lastRecord: number;
    totalDownloaded: number;
}

/**
 * @description Load progress from file
 * @returns 
 */
const loadProgress = (): Progress | null => {
    if (!fs.existsSync(PROGRESS_FILE)) return null;
    const content = fs.readFileSync(PROGRESS_FILE, 'utf8');
    const values: Record<string, number> = {};
    for (const line of content.split(/\r?\n/)) {
        const [key, value] = line.split('=');
        if (key && value) values[key.trim()] = parseInt(value.trim());
    }
    if (!Number.isFinite(values.lastPage)) return null;
    return {
        lastPage: values.lastPage,
        lastRecord: Number.isFinite(values.lastRecord) ? values.lastRecord : -1,
        totalDownloaded: Number.isFinite(values.totalDownloaded) ? values.totalDownloaded : 0,
    };
}

/**
 * @description Save progress to file
 * @param progress 
 */
const saveProgress = (progress: Progress) => {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    fs.writeFileSync(PROGRESS_FILE,
        `lastPage=${progress.lastPage}\nlastRecord=${progress.lastRecord}\ntotalDownloaded=${progress.totalDownloaded}\n`,
        'utf8');
}

/**
 * @description Wait for table response
 * @param page 
 * @param action 
 */
const withTableResponse = async (page: any, action: () => Promise<any>) => {
    const pending: Promise<any>[] = [];

    const onRequest = (request: any) => {
        if (request.url().startsWith(TBL_DATA_URL)) {
            pending.push(page.waitForResponse((response: any) =>
                response.url().startsWith(TBL_DATA_URL) && response.ok(),
                { timeout: TBL_QUERY_TIMEOUT }
            ).catch(() => null));
        }
    };

    page.on('request', onRequest);
    try {
        await action();
        await page.waitForTimeout(500);
        if (pending.length > 0) await Promise.all(pending);
    } finally {
        page.off('request', onRequest);
    }
}

/**
 * @description Navigate to a specific page in the table
 * @param page 
 * @param pageNumber 
 */
const goToPageTbl = async (page: any, pageNumber: number) => {

    try {

        // pageNumber = pageNumber + 1
        const goForward = pageNumber <= Math.ceil(params.totalPages / 2);
        if (!goForward) await withTableResponse(page, () => page.click(params.lastPage));
        let currentPage = parseInt(await page.locator(params.currentPage).textContent());

        while (currentPage !== pageNumber) {
            await withTableResponse(page, () => page.click(goForward ? params.nextPage : params.previousPage));
            currentPage = parseInt(await page.locator(params.currentPage).textContent());
        }

    } catch (error) {
        console.error('Error al navegar a la página:', error);
    }

}

/**
 * @description Run the task
 * @param startPage 
 */
export async function run({ startPage = 1 }: { startPage?: number }) {

    const { browser, context } = await createRealProfileBrowser()
    const page = await context.newPage();

    // Navigation
    await page.goto(MAIN_URL);

    const loginTile = await page.locator(params.loginTile).isVisible();
    const loginBtn = await page.locator(params.loginBtn).isVisible();
    if (loginTile || loginBtn) throw new Error('Login required');

    await page.waitForLoadState('networkidle');
    await page.goto(SECONDARY_URL);    

    // Complite form
    await page.click(params.dateRange);
    await page.waitForTimeout(500);
    await page.selectOption(params.documentsTypes, "102");

    await page.locator(params.dateRange).evaluate((el, [start, end]) => {
        const $el = (window as any).$(el);
        const drp = $el.data('daterangepicker');
        drp.setStartDate(start);
        drp.setEndDate(end);
        $el.trigger('apply.daterangepicker', drp);
    }, ["2023/01/01", "2023/12/31"]);

    // Search and wait for the table query response
    await withTableResponse(page, () => page.keyboard.press('Enter'));

    // Checkpoint: reanudar desde el último progreso guardado (o empezar desde 0)
    const progress = loadProgress() ?? { lastPage: 1, lastRecord: -1, totalDownloaded: 0 };
    const resumePage = Math.max(startPage, progress.lastPage);
    if (progress.totalDownloaded > 0) console.log(`Reanudando: página ${resumePage}, total descargado: ${progress.totalDownloaded}`);

    if (resumePage !== 1) await goToPageTbl(page, resumePage);

    try {
        for (let currentPage = resumePage; currentPage <= params.totalPages; currentPage++) {

            // Se re-consulta el locator en cada página y registro (la tabla se re-renderiza al navegar)
            const recordCount = await page.locator(params.downloadBtn).count();
            const startRecord = currentPage === progress.lastPage ? progress.lastRecord + 1 : 0;
            console.log(`Página ${currentPage}: descargando ${recordCount - startRecord} de ${recordCount} registros`);

            for (let recordIndex = startRecord; recordIndex < recordCount; recordIndex++) {
                const button = page.locator(params.downloadBtn).nth(recordIndex);

                // La descarga puede llegar en la página actual o en un popup nuevo
                const [download] = await Promise.all([
                    Promise.race([
                        page.waitForEvent('download', { timeout: TBL_QUERY_TIMEOUT }),
                        context.waitForEvent('page', { timeout: TBL_QUERY_TIMEOUT }).then(async (popup: any) => {
                            await popup.waitForLoadState('domcontentloaded');
                            const d = await popup.waitForEvent('download', { timeout: TBL_QUERY_TIMEOUT });
                            await popup.close();
                            return d;
                        }),
                    ]),
                    button.click({ force: true }),
                ]);
                await download.saveAs(path.join(DOWNLOAD_DIR, download.suggestedFilename()));

                progress.lastPage = currentPage;
                progress.lastRecord = recordIndex;
                progress.totalDownloaded++;
                saveProgress(progress);
                console.log(`Descargado [${progress.totalDownloaded}] pág ${currentPage} reg ${recordIndex + 1}: ${download.suggestedFilename()}`);
            }

            if (currentPage < params.totalPages) {
                await withTableResponse(page, () => page.click(params.nextPage));
            }
        }

        console.log(`Proceso completado. Total descargado: ${progress.totalDownloaded}`);
    } catch (error) {
        console.error('Error durante la descarga. Progreso guardado:', progress, error);
    } finally {
        await context.close();
        await browser?.close();
    }

}

run({ startPage: 1 })