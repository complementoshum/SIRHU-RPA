import { runTask } from "../../../core/TaskRunner";
import { ConnectionDB, DatabaseType } from "../../../database/Connection.db";
import { HiringRpaRequest } from "../../../params/SIRHU_V4/HIRING/Signio.params";
import { DownloadedFile } from "../../../tasks/SIRHU_V4/HIRING/Signio.task";

type RegisterBy = 'document_template_id' | 'signio_document_id';

interface RpaSignedDocument {
    file_name_prefix: string;
    signio_document_id: string | null;
    document_template_id: number | null;
}

interface TemplateFile {
    registerBy: RegisterBy;
    identifier: string;
    fileName: string;
    base64: string;
}

interface RpaSendResult {
    request_status?: string;
    required_documents_completed?: boolean;
    pending_document_template_ids?: number[];
}

class SignioHiring {

    protected connection = new ConnectionDB(DatabaseType.SIRHU_V4);
    protected sirhuV4MainUrl = process.env.SIRHU_V4_MAIN_URL!;

    private get rpaUrl() {
        return `${this.sirhuV4MainUrl}/tenants/hiring/contractsmanager/rpa/requests`;
    }

    private get rpaHeaders() {
        return { 'X-RPA-Token': process.env.SIRHU_V4_API_TOKEN! };
    }

    public async start() {

        try {

            console.log('=== Signio Hiring iniciado ===');
            const solToProcess = await this.getSolToProcess();

            // Si no hay solicitudes para procesar, terminar el programa
            if (solToProcess.length === 0) {
                console.log('=== No hay solicitudes para procesar ===');
                this.connection.close();
                process.exit(0);
            }

            // Bucle principal
            for (const request of solToProcess) {

                // await this.chengeStatus(request.id, 'A');

                const licencias = await runTask<{ folderId: string }, DownloadedFile[] | null>(
                    'SIRHU_V4/HIRING/Signio',
                    { folderId: request.signio_transaction_id! }
                );

                if (!licencias) continue;

                const templateFiles = await this.identifyTemplates(request.signio_transaction_id, licencias);
                const result = await this.sendDocuments(request.signio_transaction_id, templateFiles);
                console.log(`Solicitud ${request.id}: estado ${result.request_status}, pendientes:`, result.pending_document_template_ids);

                // await this.chengeStatus(request.id, 'F');
            }

        } catch (error) {
            console.error('Error al procesar las solicitudes:', error);
            throw error;
        } finally {
            this.connection.close();
            process.exit(0);
        }

    }

    private async getSolToProcess(): Promise<HiringRpaRequest[]> {
        try {
            const sSql = `SELECT TOP 10 * FROM hiring_rpa_signing_requests WHERE signio_status = ? AND status = ?`;
            const result = await this.connection.query(sSql, ['SIGNED', 'P']) as HiringRpaRequest[];
            return result;
        } catch (error) {
            console.error('Error al obtener solicitudes a procesar:', error);
            throw error;
        }
    }

    /**
     * Identifica el document_template_id de cada archivo descargado de Signio.
     * Signio agrega un sufijo al nombre, por lo que se compara por prefijo (file_name_prefix).
     */
    private async identifyTemplates(transactionId: string, files: DownloadedFile[]): Promise<TemplateFile[]> {
        const response = await fetch(`${this.rpaUrl}/${transactionId}/documents`, { headers: this.rpaHeaders });
        if (!response.ok) throw new Error(`Error al consultar documentos de la solicitud ${transactionId} (HTTP ${response.status}) [${response.url}]: ${await response.text()}`);

        const { data } = await response.json() as { data: { register_by?: RegisterBy; signed_documents: RpaSignedDocument[] } };
        const registerBy: RegisterBy = data.register_by ?? 'document_template_id';

        return files.map(file => {
            const [fileName, base64] = Object.entries(file)[0];
            const signed = data.signed_documents.find(doc => fileName.startsWith(doc.file_name_prefix));

            if (!signed || !signed[registerBy]) {
                throw new Error(`No se pudo identificar el ${registerBy} del archivo "${fileName}"`);
            }

            return { registerBy, identifier: String(signed[registerBy]), fileName, base64 };
        });
    }

    /**
     * Envía los documentos descargados de Signio al back (multipart/form-data).
     */
    private async sendDocuments(transactionId: string, templateFiles: TemplateFile[]): Promise<RpaSendResult> {
        const form = new FormData();

        templateFiles.forEach(({ registerBy, identifier, fileName, base64 }, i) => {
            form.append(`documents[${i}][${registerBy}]`, identifier);
            form.append(`documents[${i}][file]`, new Blob([Buffer.from(base64, 'base64')], { type: 'application/pdf' }), fileName);
            form.append(`documents[${i}][observations]`, 'Cargado por RPA');
        });

        const response = await fetch(`${this.rpaUrl}/${transactionId}/documents`, {
            method: 'POST',
            headers: this.rpaHeaders,
            body: form,
        });

        const body = await response.json() as { message?: string; data: RpaSendResult };
        if (!response.ok) throw new Error(`Error al enviar documentos de la solicitud ${transactionId} (HTTP ${response.status}): ${body.message}`);

        return body.data;
    }

    private async chengeStatus(id: number, status: string) {
        try {
            const sSql = `UPDATE hiring_rpa_signing_requests SET status = ? WHERE id = ?`;
            await this.connection.query(sSql, [status, id]);
        } catch (error) {
            console.error('Error al cambiar el estado de la solicitud:', error);
            throw error;
        }
    }

}

export const start = async () => await (new SignioHiring).start();

if (require.main === module) {
    start();
}
