import { runTask } from "../core/TaskRunner";
import AdresQuerys from "../database/ADRES/adres.querys";
import { ConnectionDB, DatabaseType } from "../database/Connection.db";
import { AdresResponse } from "../params/ADRES/Adres.params";
import { DefuncionesRegistraduriaResponse } from "../params/ESTUDIO_ANTECEDENTES/DefuncionesRegistraduria.params";
import { RegistraduriaCertificadoResponse } from "../params/ESTUDIO_ANTECEDENTES/RegistraduriaCertificadoCedulaDeCiudadania.params";
import { ParserUtil } from "../utils/Parser.util";
import * as fs from "fs";
import * as path from "path";

class DifuntosRPA {

    protected connection = new ConnectionDB(DatabaseType.COMPLE);
    protected querys = new AdresQuerys();
    protected sqlLogPath = path.join(process.cwd(), 'errores_difuntos_sql_log.txt');

    public async start() {

        /**
         * :: BLOQUE SE CONSULTA EN DEFUNCIONES REGISTRADURIA ::
         */

        // const unknowLiveStatus = await this.getValidateLive() as any[];

        // for (const solicitud of unknowLiveStatus) {

        //     const response: DefuncionesRegistraduriaResponse = await runTask('ESTUDIO_ANTECEDENTES/DefuncionesRegistraduria', {
        //         documentNumber: solicitud.nit
        //     });

        //     // Guardar la captura
        //     const date = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '')
        //     const img = await ParserUtil.base64ToWebp(`/Documentacion/produccion/complementos/validacion_defunciones/${solicitud.nit}_${date}.webp`, response.screenshot || '');

        //     if(response.success) {
        //         await this.connection.query('UPDATE T_difuntos_RPA SET muerto = ?, url_soporte = ? WHERE id = ?', [(response.isDead ? 1 : 0), img, solicitud.id]);
        //     } else {
        //         await this.connection.query('UPDATE T_difuntos_RPA SET estado = ?, url_soporte = ? WHERE id = ?', ['E', img, solicitud.id]);
        //     }

        // }

        /**
         * :: BLOQUE SE CONSULTA EN REGISTRADURIA (EXTRAE LA FECHA) ::
         */
        const solicitudes = await this.getPersonsToExtraDeadDate() as any[];

        for (const solicitud of solicitudes) {

            const dateExp = new Date(solicitud.fecha_expedicion);

            const day = String(dateExp.getUTCDate()).padStart(2, '0');
            const month = String(dateExp.getUTCMonth() + 1).padStart(2, '0');
            const year = dateExp.getUTCFullYear();

            const response: RegistraduriaCertificadoResponse = await runTask('ESTUDIO_ANTECEDENTES/RegistraduriaCertificadoCedulaDeCiudadania', {
                documentNumber: solicitud.nit,
                expDay: day,
                expMonth: month,
                expYear: String(year)
            });

            if(response.success) {
                // Guardar la captura
                const date = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '')
                const imgPath = `/Documentacion/produccion/complementos/validacion_defunciones/${solicitud.nit}_${date}.webp`
                await ParserUtil.base64ToWebp(imgPath, response.screenshot || '', true);

                let fechaDefuncion = null;
                if (response.deadDate) {
                    const [dd, mm, aaaa] = response.deadDate.split('/');
                    fechaDefuncion = `${aaaa}-${mm}-${dd}`;
                }

                await this.connection.query('UPDATE T_difuntos_RPA SET url_soporte_difunto = ?, fecha_defuncion = ?, estado = ? WHERE id = ?', [imgPath, fechaDefuncion, 'F', solicitud.id]);
            } else {
                await this.connection.query('UPDATE T_difuntos_RPA SET estado = ? WHERE id = ?', ['R', solicitud.id]);
                console.log('=== Error al procesar la solicitud ===', solicitud.id);
                console.log(response);
            }


        }

        /**
         * :: BLOQUE SE CONSULTA EN EL ADRES ::
         */
        // const validateToAdres: any[] = await this.getPersonToSearchInAdres()

        // const pageSize = 10;
        // const currentPage = 10; // Variable de control de página
        // const totalPages = Math.ceil(this.registrosDifuntos.length / pageSize);
        
        // console.log(`Total de registros: ${this.registrosDifuntos.length}`);
        // console.log(`Total de páginas: ${totalPages}`);
        // console.log(`Página actual: ${currentPage}/${totalPages}`);

        // const startIndex = (currentPage - 1) * pageSize;
        // const endIndex = startIndex + pageSize;
        // const paginatedRecords: any[] = this.registrosDifuntos.slice(startIndex, endIndex);

        // let fulanos = 0;

        // console.log(`Procesando registros del ${startIndex + 1} al ${Math.min(endIndex, this.registrosDifuntos.length)}`);

        // for (const solicitud of paginatedRecords) {

        //     fulanos++;
        //     console.log(`Fulano #${fulanos}`);

        //     const response: AdresResponse = await runTask('ADRES/Adres', {
        //         documentNumber: solicitud.nit.toString(),
        //         documentType: this.convertDocumentType(solicitud.tipo_documento)
        //     });

        //     if (!response.person.screenShot) {
        //         throw new Error('Sin soporte')
        //         process.exit(1)
        //     }

        //     // Guardar la captura
        //     const date = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '')
        //     const realImgPath = `/Documentacion/produccion/complementos/validacion_defunciones/${solicitud.nit}_${date}.webp`
        //     const imgPath = `C:\\Users\\james.rudas\\Downloads\\validacion_defunciones\\${solicitud.nit}_${date}.webp`
        //     await ParserUtil.base64ToWebp(imgPath, response.person.screenShot);

        //     if (response.success) {

        //         const status = response.person.epsStatus.toUpperCase()
        //         const muerto = (status.includes('FALLECIDO') || status.includes('MUERTO')) ? 1 : 0

        //         const sql = `UPDATE T_difuntos_RPA SET muerto = ${muerto}, url_soporte_difunto = '${realImgPath}' WHERE id = ${solicitud.id}`

        //         // Guardar el SQL en el archivo txt
        //         fs.appendFileSync(this.sqlLogPath, sql + '\n', 'utf8');
        //     } else {
        //         const sql = `UPDATE T_difuntos_RPA SET muerto = 0, url_soporte_difunto = '${realImgPath}' WHERE id = ${solicitud.id} --NO ESTÁ REGISTRADO`
        //         fs.appendFileSync(this.sqlLogPath, sql + '\n', 'utf8');
        //     }

        // }

        await this.connection.close();
        process.exit(0);
    }

    private async getPersonsToExtraDeadDate() {
        return await this.connection.query(`
            SELECT TOP 5 * FROM T_difuntos_RPA 
            WHERE muerto = ? 
            AND fecha_expedicion IS NOT NULL 
            AND url_soporte_difunto IS NULL
            AND tipo_documento = ? 
            AND estado = ?
        `, [1, 'C', 'P']);
    }

    private async getValidateLive() {
        const solicitudes = await this.connection.query(`
            SELECT TOP 10 * FROM T_difuntos_RPA WITH(NOLOCK)
            WHERE muerto IS NULL AND estado = 'P'
            AND nit IN (
                SELECT * FROM T_distinct_seguridad_2023
            ) 
        `);
        return solicitudes; // 28360 30 nov 2004 
    }

    private convertDocumentType(document: string) {
        const documents: { [key: string]: string } = {
            "C": "CC",
            "E": "CE",
            "P": "PA",
            "PE": "PE",
            "PT": "PT",
            "RC": "RC",
            "T": "TI",
        }
        const response = documents[document]
        if(!response) throw new Error('Tipo documento no encontrado');
        return response  
    }

    // private async getPersonToSearchInAdres() {
    //     return await this.connection.query(`
    //         SELECT TOP 1 * FROM complementos..T_difuntos_RPA WHERE muerto = ? AND estado = ? AND tipo_documento <> ?
    //     `, [1, 'P', 'C'])
    // }

    // Arreglo de registros para recorrer
    protected registrosDifuntos = [];

}

export const start = async () => await (new DifuntosRPA).start();

if (require.main === module) {
    start();
}
