import { runTask } from "../../core/TaskRunner";
import { ConnectionDB, DatabaseType } from "../../database/Connection.db";
import { RegisterDian } from "../../params/CUSTOM/CatalogoVpfeDianPublic.params";

class CatalogoVpfeDianPublicRPA {
    protected connection = new ConnectionDB(DatabaseType.COMPLE);

    protected setup: boolean = false;

    // Cantidad de solicitudes (y navegadores) procesadas por ejecución
    protected batchSize: number = 108;

    public async start() {

        // Si ya hay batchSize+ registros en proceso (V), esperar a que finalicen
        await this.esperarDisponibilidad();

        const solicitudes = await this.getSolicitudes();
        console.log(`Solicitudes pendientes: ${solicitudes.length}`);

        const results = await Promise.allSettled(
            solicitudes.map((solicitud, index) => this.procesarSolicitud(solicitud, index))
        );

        results.forEach((r, i) => {
            if (r.status === 'rejected') {
                console.error(`Error en solicitud ${solicitudes[i].id}:`, r.reason);
            }
        });

        await this.connection.close();

    }

    private async procesarSolicitud(solicitud: RegisterDian, index: number) {

        try {
            // Se cambia el estado a "Validando"
            if (!this.setup) await this.setEstado(solicitud.id, 'V');

            const result = await runTask("CUSTOM/CatalogoVpfeDianPublic", {
                cufeCode: solicitud['CUFE/CUDE'],
                document: solicitud.nit,
                setup: this.setup
            }) as string | false;

            if (this.setup) return;

            if (result) {
                // Finalizó correctamente: ruta del soporte + estado F
                await this.setEstado(solicitud.id, 'F', result);
            } else {
                // La tarea no logró descargar
                await this.setEstado(solicitud.id, 'E');
            }
        } catch (error) {
            // Cualquier excepción (timeout, captcha, etc.) también marca E para que
            // el registro no quede atascado en V
            console.error(`[id ${solicitud.id}] Error procesando solicitud:`, error);
            if (!this.setup) await this.setEstado(solicitud.id, 'E');
        }

    }

    private async setEstado(id: number, estado: string, urlSoporte: string | null = null) {
        await this.connection.query(
            `UPDATE T_consulta_RPA_DIAN SET estado = ?, url_soporte = COALESCE(?, url_soporte), fechas_ultima_ejecucion = GETDATE() WHERE id = ?`,
            [estado, urlSoporte, id]
        );
    }

    public async getSolicitudes() {
        return await this.connection.query(
            `SELECT TOP 18 * FROM T_consulta_RPA_DIAN WHERE estado = ?`,
            ['P']
        ) as RegisterDian[]

    }

    private async esperarDisponibilidad() {
        while (true) {
            const [{ count }] = await this.connection.query(
                `SELECT COUNT(id) AS count FROM T_consulta_RPA_DIAN WHERE estado = ?`,
                ['V']
            ) as any[];

            if (count < this.batchSize) return;

            console.log(`Hay ${count} solicitudes en proceso (V). Esperando a que finalicen...`);
            await new Promise(r => setTimeout(r, 30000));
        }
    }

}

export const start = async () => await (new CatalogoVpfeDianPublicRPA).start();

if (require.main === module) {
    start();
}

