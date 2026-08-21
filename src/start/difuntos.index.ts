import { runTask } from "../core/TaskRunner";
import { ConnectionDB, DatabaseType } from "../database/Connection.db";
import { DefuncionesRegistraduriaResponse } from "../params/ESTUDIO_ANTECEDENTES/DefuncionesRegistraduria.params";
import { RegistraduriaCertificadoResponse } from "../params/ESTUDIO_ANTECEDENTES/RegistraduriaCertificadoCedulaDeCiudadania.params";
import { ParserUtil } from "../utils/Parser.util";

class DifuntosRPA {

    protected connection = new ConnectionDB(DatabaseType.COMPLE);

    public async start() {

        const unknowLiveStatus = await this.getValidateLive() as any[];

        for (const solicitud of unknowLiveStatus) {

            const response: DefuncionesRegistraduriaResponse = await runTask('ESTUDIO_ANTECEDENTES/DefuncionesRegistraduria', {
                documentNumber: solicitud.nit
            });

            // Guardar la captura
            const date = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '')
            const img = await ParserUtil.base64ToWebp(`/Documentacion/produccion/complementos/validacion_defunciones/${solicitud.nit}_${date}.webp`, response.screenshot || '');

            if(response.success) {
                await this.connection.query('UPDATE T_difuntos_RPA SET muerto = ?, url_soporte = ? WHERE id = ?', [(response.isDead ? 1 : 0), img, solicitud.id]);
            } else {
                await this.connection.query('UPDATE T_difuntos_RPA SET estado = ?, url_soporte = ? WHERE id = ?', ['E', img, solicitud.id]);
            }

        }


        // const solicitudes = await this.getSolicitudes() as any[];

        // console.log(solicitudes.length);

        // for (const solicitud of solicitudes) {

        //     // Actualizamos el estado
        //     // await this.connection.query(
        //     //     `UPDATE T_difuntos_RPA SET estado = ? WHERE id = ?`,
        //     //     ['V', solicitud.id]
        //     // );

        //     // Si tiene fecha de expedicion, procesamos la solicitud por la registraduria
        //     if (solicitud.fecha_expedicion) {

        //         const date = new Date(solicitud.fecha_expedicion);

        //         const day = String(date.getDate()).padStart(2, '0');
        //         const month = String(date.getMonth() + 1).padStart(2, '0');
        //         const year = date.getFullYear();

        //         const response: RegistraduriaCertificadoResponse = await runTask('ESTUDIO_ANTECEDENTES/RegistraduriaCertificadoCedulaDeCiudadania', {
        //             documentNumber: solicitud.nit,
        //             expDay: day,
        //             expMonth: month,
        //             expYear: String(year)
        //         });

        //         console.log(response);

        //     }

        // }

        await this.connection.close();
        process.exit(0);
    }

    private async getSolicitudes() {
        const solicitudes = await this.connection.query('SELECT TOP 10 * FROM T_difuntos_RPA WHERE estado = ? AND fecha_expedicion IS NOT NULL', ['P']);
        return solicitudes;
    }

    private async getValidateLive() {
        const solicitudes = await this.connection.query(`
            SELECT TOP 10 * FROM T_difuntos_RPA WITH(NOLOCK)
            WHERE muerto IS NULL AND estado = 'P'
            AND nit IN (
                SELECT * FROM T_distinct_seguridad_2023
            ) 
        `);
        return solicitudes;
    }

}

export const start = async () => await (new DifuntosRPA).start();

if (require.main === module) {
    start();
}
