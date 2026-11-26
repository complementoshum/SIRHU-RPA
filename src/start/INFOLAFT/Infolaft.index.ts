import fs from "fs/promises";
import path from "path";
import { runTask } from "../../core/TaskRunner";
import { ConnectionDB, DatabaseType } from "../../database/Connection.db";
import { InfolaftQuery } from "../../params/INFOLAFT/Infolaft.params";
import { infolaftIsLoggedIn } from "../../tasks/INFOLAFT/LoginInfolaft.task";
import { isWindows } from "../../utils/Common.util";

class Infolaft {

    protected connection = new ConnectionDB(DatabaseType.SIRHU);
    protected LIMIT_SOLS_PER_DAY = 500;
    protected LIMIT_EXECUTIONS_PER_DAY = 1;
    protected STATE_FILE = path.resolve(process.cwd(), 'infolaft_daily_state.json');

    public async start() {

        try {

            // :: Se valida el límite de ejecuciones por día ::
            if (!await this.registerExecution()) {
                console.log(`=== Límite de ejecuciones diarias alcanzado (${this.LIMIT_EXECUTIONS_PER_DAY}) ===`);
                await this.connection.close();
                process.exit(0);
            }

            // :: Se obtienen las solicitudes iniciales a procesar ::
            let SOL_TO_PROCESS = await this.getSoliToProcess();

            if (SOL_TO_PROCESS.length === 0) {
                console.log('=== No hay solicitudes para procesar ===');
                await this.connection.close();
                process.exit(0);
            }

            // :: Se realiza el login para reunitilizar la sessión ::
            const loginResult = await runTask<null, { browser: any; context: any; page: any } | null>('INFOLAFT/LoginInfolaft', null);
            
            if (!loginResult) throw new Error('Login failed, all attempts exhausted');

            // :: Se realiza la búsqueda en loop ::
            let solController: boolean = true;
            let isFirstIteration: boolean = true;
            let processedCount: number = 0;

            while (solController){

                // Si se alcanzó el límite de solicitudes por ejecución, se sale del loop
                if (processedCount >= this.LIMIT_SOLS_PER_DAY) {
                    console.log(`=== Límite de solicitudes alcanzado (${this.LIMIT_SOLS_PER_DAY}) ===`);
                    break;
                }

                // Si no es la primera iteración, se obtienen las solicitudes a procesar
                if(!isFirstIteration) SOL_TO_PROCESS = await this.getSoliToProcess();
                isFirstIteration = false;
                
                // Si no hay solicitudes, se sale del loop
                if(SOL_TO_PROCESS.length === 0) {
                    solController = false;
                    break;
                }

                // :: Se procesan las solicitudes ::
                for (const sol of SOL_TO_PROCESS.slice(0, this.LIMIT_SOLS_PER_DAY - processedCount)) {
                    
                    // Se valida que la sesión siga activa, de lo contrario se detiene el proceso
                    if (!await infolaftIsLoggedIn(loginResult.page, 5000)) {
                        console.error('=== Sesión de Infolaft perdida, se detiene el proceso ===');
                        await this.closeConnection(loginResult);
                    }

                    console.log(`=== Procesando solicitud ${sol.id} (${processedCount + 1}/${this.LIMIT_SOLS_PER_DAY}) ===`);
                    processedCount++;

                    const result = await runTask('INFOLAFT/GetSearchInfolaft', { ...loginResult, idToSearch: sol.idInfolaft });
                    
                    // Si no se pudo procesar la solicitud, se marca como error y se continúa con la siguiente
                    if(!result) {
                        console.log('=== No se pudo procesar la solicitud ===');
                        await this.updateStatus(sol.id, 'E');
                        continue;
                    }

                    // Si se procesó la solicitud, se obtiene el archivo y se guarda
                    const { path: dirPath, fileName } = await this.buildPathToSave(sol);

                    // Ruta canónica (Linux) que se guarda en base de datos
                    const linuxDir = dirPath.replace(/\\/g, '/');
                    const dbPath = path.posix.join(linuxDir, fileName);

                    // Se ajusta la ruta física si estamos en Windows
                    const pathToSave = isWindows()
                        ? path.win32.normalize(linuxDir.replace(process.env.LINUX_VOL || '/Documentacion', process.env.WINDOWS_VOL || 'Z:\\').replace(/\//g, '\\'))
                        : linuxDir;

                    const pdfFileBase64 = (result as { file: string }).file;

                    // Se guarda el archivo en el filesystem
                    try {
                        console.log(`=== Guardando PDF de la solicitud ${sol.id} en ${pathToSave} ===`);
                        await fs.mkdir(pathToSave, { recursive: true });
                        await fs.writeFile(path.join(pathToSave, fileName), Buffer.from(pdfFileBase64, 'base64'));
                        await this.updateSoli(sol.id, dbPath);
                    } catch (error) {
                        console.error(`Error guardando el PDF de la solicitud ${sol.id}:`, error);
                        await this.updateStatus(sol.id, 'E');
                    }

                    console.log(`=== Solicitud ${sol.id} procesada correctamente ===`);

                }
            }


            // :: Se cierra la conexión y termina el proceso ::
            await this.closeConnection(loginResult);

        } catch (error) {
            console.error('Error en el proceso principal:', error);
            await this.connection.close();
            process.exit(0); 
        }

    }

    // Registra la ejecución del día en un archivo local; retorna false si ya se alcanzó el límite
    private async registerExecution(): Promise<boolean> {
        const today = new Date().toLocaleDateString('en-CA');
        let state = { date: today, executions: 0 };

        try {
            const saved = JSON.parse(await fs.readFile(this.STATE_FILE, 'utf-8'));
            if (saved.date === today) state = saved;
        } catch { /* sin estado previo */ }

        if (state.executions >= this.LIMIT_EXECUTIONS_PER_DAY) return false;

        state.executions++;
        await fs.writeFile(this.STATE_FILE, JSON.stringify(state));
        return true;
    }

    private async closeConnection(loginResult: { browser: any; context: any; page: any }) {
        await loginResult.context.close();
        await loginResult.browser?.close();
        await this.connection.close();
        process.exit(0);
    }

    private async getSoliToProcess(): Promise<InfolaftQuery[]> {
        const query = `
            SELECT TOP 10 * FROM T_GH_solicitudInfolaft WHERE estado = ? AND rutaArchivo IS NULL 
            AND idProceso IS NOT NULL and idInfolaft IS NOT NULL AND (dataApi IS NULL OR dataApi = '')
            ORDER BY fechaHora DESC
        `;
        return await this.connection.query(query, ['F']) as InfolaftQuery[];
    }

    private async buildPathToSave(row: InfolaftQuery): Promise<{path: string, fileName: string}> {
        
        const baseStr = `${process.env.LINUX_VOL || '/Documentacion'}/{environment}/{database}/${row.nit.toString().trim()}/nominas/${row.idNomina.toString().trim()}/procesos/infolaft/${row.idProceso.toString().trim()}/`
        const fileName = `27_${row.nit.toString().trim()}.pdf`

        const getDataBaseName = async (id: number): Promise<string> => {
            const result: any[] = await this.connection.query('SELECT bd FROM T_G_appDatabases WHERE idBd = ?', [id]);
            return result[0]?.bd ?? '';
        }

        return {
            path: path.normalize(baseStr
                .replaceAll('{database}', await getDataBaseName(row.idBd))
                .replaceAll('{environment}', process.env.ENVIROMENT || 'sandbox')),
            fileName: fileName
        };
    }

    private async updateStatus(id: number, status: string) {
        const query = 'UPDATE T_GH_solicitudInfolaft SET estado = ? WHERE id = ?';
        await this.connection.query(query, [status, id]);
    }

    private async updateSoli(id: number, filePath: string){
        const query = 'UPDATE T_GH_solicitudInfolaft SET rutaArchivo = ?, fechaFinalizacion = GETDATE() WHERE id = ?';
        await this.connection.query(query, [filePath, id]);
    }

}

export const start = async () => await (new Infolaft).start();
if (require.main === module) start();

