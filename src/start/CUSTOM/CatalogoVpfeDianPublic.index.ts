import { runTask } from "../../core/TaskRunner";
import { ConnectionDB, DatabaseType } from "../../database/Connection.db";
import { RegisterDian } from "../../params/CUSTOM/CatalogoVpfeDianPublic.params";

class CatalogoVpfeDianPublicRPA {
    protected connection = new ConnectionDB(DatabaseType.COMPLE);

    protected setup: boolean = true;

    public async start() {

        // Si hay 10+ registros en proceso (V), esperar a que finalicen
        await this.esperarDisponibilidad();

        const solicitudes = await this.getSolicitudes();

        await Promise.allSettled(
            solicitudes.map((solicitud, index) => this.procesarSolicitud(solicitud, index))
        );

        await this.connection.close();

    }

    private async procesarSolicitud(solicitud: RegisterDian, index: number) {

        // Se cambia el estado a "Validando"
        if (!this.setup) {
            await this.connection.query(
                `UPDATE T_consulta_RPA_DIAN SET estado = ?, fechas_ultima_ejecucion = GETDATE() WHERE id = ?`,
                ['V', solicitud.id]
            );
        }

        const result = await runTask("CUSTOM/CatalogoVpfeDianPublic", {
            cufeCode: solicitud['CUFE/CUDE'],
            document: solicitud.nit,
            profileIndex: index,
            setup: this.setup
        }) as string | false;

        if (!this.setup) {
            if (result) {
                // Finalizó correctamente: ruta del soporte + fecha de ejecución
                await this.connection.query(
                    `UPDATE T_consulta_RPA_DIAN SET estado = ?, url_soporte = ?, fechas_ultima_ejecucion = GETDATE() WHERE id = ?`,
                    ['F', result, solicitud.id]
                );
            } else {
                // Algo falló en la tarea
                await this.connection.query(
                    `UPDATE T_consulta_RPA_DIAN SET estado = ?, fechas_ultima_ejecucion = GETDATE() WHERE id = ?`,
                    ['E', solicitud.id]
                );
            }
        }
        
    }

    public async getSolicitudes() {
        return await this.connection.query(
            `SELECT TOP 10 * FROM T_consulta_RPA_DIAN WHERE estado = ?`,
            ['P']
        ) as RegisterDian[]

    }

    private async esperarDisponibilidad() {
        while (true) {
            const [{ count }] = await this.connection.query(
                `SELECT COUNT(id) AS count FROM T_consulta_RPA_DIAN WHERE estado = ?`,
                ['V']
            ) as any[];

            if (count < 10) return;

            console.log(`Hay ${count} solicitudes en proceso (V). Esperando a que finalicen...`);
            await new Promise(r => setTimeout(r, 30000));
        }
    }

}

export const start = async () => await (new CatalogoVpfeDianPublicRPA).start();

if (require.main === module) {
    start();
}

