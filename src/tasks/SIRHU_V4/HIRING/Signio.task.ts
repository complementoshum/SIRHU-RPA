import { createSimpleBrowser } from "../../../core/BrowserFactory";

const SIGNED_STATUS = 'Firmado';
const SIGNER_ROWS_SELECTOR = 'tbody tr:has(td b.text-uppercase)';
const NON_DOCUMENT_CELLS = 2;
const DOCUMENT_HEADERS_SELECTOR = 'thead th.envelope-documents-td';

type SignatureMatrix = string[][];
export type DownloadedFile = Record<string, string>;

export async function run({ folderId }: { folderId: string }): Promise<DownloadedFile[] | null> {

    const SIGNIO_MAIN_URL = 'https://signio.early.legops.com'
    const SIGNIO_EMAIL = process.env.SIGNIO_USR!;
    const SIGNIO_PASSWORD = process.env.SIGNIO_PASS!;

    if (!SIGNIO_EMAIL || !SIGNIO_PASSWORD) throw new Error('SIGNIO credentials are missing!');

    const { browser, context } = await createSimpleBrowser();
    const page = await context.newPage();

    try {

        // ::: Inicio de sesión en la plataforma :::
        await page.goto(SIGNIO_MAIN_URL + '/login');

        // Completar el formulario
        await page.fill('xpath=//*[@id="email"]', SIGNIO_EMAIL);
        await page.fill('xpath=//*[@id="password"]', SIGNIO_PASSWORD);
        await page.click('xpath=//*[@id="loginForm"]/div[3]/div[2]/button');

        // Esperar a que la página cargue antes de redirigir
        await page.waitForLoadState('networkidle');
        await page.goto(SIGNIO_MAIN_URL + '/es/documentos/estado/' + folderId);
        await page.waitForLoadState('networkidle');

        // ::: Validar, procesar y descargar documentos :::

        // Se valida que todos los docuemntos esten firmados
        if (!await validateDocuments(page)) throw new Error('Some documents are not signed');
        console.log('::: All documents are signed, proceeding with download :::');

        // Se descargan los documentos
        const files = await downloadDocuments(page);

        if (files.length === 0) {
            console.log('::: No files were downloaded :::');
            return null;
        }

        console.log('::: Files downloaded successfully :::');
        return files;

    } catch (error) {
        console.error(error);
        throw error;
    } finally {
        await browser.close();
        await context.close();
    }

}

// :: Funciones auxiliares para las validaciones ::
const readSignatureMatrix = (page: any): Promise<SignatureMatrix> =>
    page.$$eval(
        SIGNER_ROWS_SELECTOR,
        (rows: Element[], skip: number) =>
            rows.map(row =>
                Array.from(row.querySelectorAll(':scope > td'))
                    .slice(skip)
                    .map(cell =>
                        // Se normalizan saltos de línea y espacios del HTML
                        (cell.querySelector('small')?.textContent ?? '').replace(/\s+/g, ' ').trim()
                    )
            ),
        NON_DOCUMENT_CELLS
    );

const validateDocuments = async (page: any): Promise<boolean> => {
    const matrix = await readSignatureMatrix(page);

    // Sin firmantes no hay nada que validar, se considera inválido
    if (!matrix.length) return false;

    const documentCount = Math.max(...matrix.map(signerRow => signerRow.length));
    if (!documentCount) return false;

    for (let doc = 0; doc < documentCount; doc++) {
        // Estados de los firmantes requeridos para este documento (se omiten celdas vacías)
        const requiredStatuses = matrix.map(signerRow => signerRow[doc] ?? '').filter(Boolean);

        const hasSigners = requiredStatuses.length > 0;
        const allSigned = requiredStatuses.every(status => status === SIGNED_STATUS);

        if (!hasSigners || !allSigned) {
            console.log(`Documento ${doc + 1} no está completamente firmado:`, requiredStatuses);
            return false;
        }
    }

    return true;
};

// :: Funciones auxiliares para la descarga ::
const readDocumentLinks = (page: any): Promise<{ name: string; url: string }[]> =>
    page.$$eval(DOCUMENT_HEADERS_SELECTOR, (headers: Element[]) =>
        headers.map(header => ({
            name: header.querySelector('a.form-control')!.getAttribute('aria-label')!.trim(),
            // La propiedad `href` ya devuelve la URL absoluta (el atributo es relativo)
            url: (header.querySelector('a[aria-label="Descargar"]') as HTMLAnchorElement).href,
        }))
    );

const downloadDocuments = async (page: any): Promise<DownloadedFile[]> => {
    const links = await readDocumentLinks(page);
    const files: DownloadedFile[] = [];

    for (const { name, url } of links) {
        const response = await page.request.get(url);
        if (!response.ok()) throw new Error(`Could not download "${name}" (HTTP ${response.status()})`);

        files.push({ [name]: (await response.body()).toString('base64') });
        console.log(`Downloaded: ${name}`);
    }

    return files;
};


// (() => {
//     run({ folderId: 'ea36355e-3a14-41b4-b3bd-1e37552ee1fc' });
// })();

