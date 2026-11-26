import { fillAngular } from "../../utils/Common.util";

const SEARCH_URL = 'https://www.infolaftsearch.com/#!/historicsearch';
const TABLE_TIMEOUT_MS = 30000;
const DOWNLOAD_TIMEOUT_MS = 60000;
const EMPTY_CONFIRM_MS = 3000;

// ::: AUX FNT :::
// Espera la tabla (identificada por una columna) y retorna null si está vacía ("No se encontraron registros")
async function waitOverlayHidden(page: any) {
    await page.locator('#application-load-indicator-overlay').waitFor({ state: 'hidden', timeout: TABLE_TIMEOUT_MS }).catch(() => {});
}

// La fila "vacía" puede mostrarse mientras carga la data, por eso se confirma que persista con el loader oculto
async function waitTableWithRows(page: any, headerText: string) {
    const table = page.locator('table[md-table]', { has: page.locator('th', { hasText: headerText }) }).first();
    const dataRows = table.locator('tbody tr[md-row]:not(:has(td[colspan]))');
    const emptyRow = table.locator('tbody tr[md-row]:has(td[colspan])').first();

    const deadline = Date.now() + TABLE_TIMEOUT_MS;
    let emptySince = 0;

    while (Date.now() < deadline) {
        await waitOverlayHidden(page);
        if (await dataRows.count() > 0) return table;

        if (await emptyRow.isVisible()) {
            emptySince ||= Date.now();
            if (Date.now() - emptySince >= EMPTY_CONFIRM_MS) return null;
        } else emptySince = 0;

        await page.waitForTimeout(500);
    }

    throw new Error(`Timeout esperando la tabla "${headerText}"`);
}

// Abre el menú de la última columna de la primera fila y hace click en la opción indicada
async function clickRowMenuOption(page: any, table: any, optionText: string) {
    await waitOverlayHidden(page);
    await table.locator('tbody tr[md-row]:not(:has(td[colspan]))').first().locator('td').last().locator('button[aria-haspopup="true"]').click();
    const option = page.locator('md-menu-content:visible button', { hasText: optionText }).first();
    await option.waitFor({ state: 'visible', timeout: 10000 });
    return option;
}

// ::: MAIN FNT :::
export default async function run({ page, idToSearch }: { browser: any, context: any, page: any, idToSearch: number }): Promise<{ file: string } | null> {

    try {

        await page.goto(SEARCH_URL);

        await fillAngular(page, 'input[ng-model="$ctrl.searchFilter.id"]', idToSearch.toString());
        await page.click('xpath=//*[@id="content"]/section/standard-view/section/div/div/section/div[2]/ng-transclude/div/div[1]/div/form/div/div[1]/div/div[3]/div/button[1]');

        // :: Tabla de búsquedas -> Entrar ::
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(1000);
        const searchTable = await waitTableWithRows(page, 'Texto Buscado');
        if (!searchTable) {
            console.warn(`Sin resultados en la búsqueda para el ID ${idToSearch}`);
            return null;
        }
        await (await clickRowMenuOption(page, searchTable, 'Entrar')).click();

        // :: Tabla de historial de ejecuciones -> Descargar PDF ::
        const detailTable = await waitTableWithRows(page, 'Fecha de ejecución');
        if (!detailTable) {
            console.warn(`Sin ejecuciones en el detalle para el ID ${idToSearch}`);
            return null;
        }
        const pdfOption = await clickRowMenuOption(page, detailTable, 'Descargar PDF');

        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: DOWNLOAD_TIMEOUT_MS }),
            pdfOption.click(),
        ]);

        const stream = await download.createReadStream();
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        await download.delete().catch(() => {});

        return { file: Buffer.concat(chunks).toString('base64') };

    } catch (error) {
        console.error('Error searching Infolaft:', error);
        return null;
    }

}
