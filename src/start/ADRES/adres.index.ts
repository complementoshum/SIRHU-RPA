import { runTask } from "../../core/TaskRunner";
import AdresQuerys from "../../database/ADRES/adres.querys";
import { AdresResponse } from "../../params/ADRES/Adres.params";
import { ParserUtil } from "../../utils/Parser.util";

class AdresRPA {

    protected querys = new AdresQuerys();

    /**
     * @function start
     * @description Función principal del proceso 
     * @returns {Promise<void>}
     */
    public async start() {

        try {

            // Se valida si la lista esta activa
            if (! await this.querys.isActiveList()) {
                console.log('=== El ADRES no se encuentra activo en la lista de riesgo ===');
                process.exit(0);
            }

            // Se valida si no se ha alcanzado el maximo de solicitudes en procesamiento
            if (! await this.querys.getValidSol()) {
                console.log('=== Se ha alcanzado el limite de solicitudes en cola ===');
                process.exit(0);
            }

            // Se obtienen las solicitudes pendientes
            const registers = await this.querys.getRegisters();

            // Se valida si hay solicitudes para procesar
            if (registers.length === 0) {
                console.log('=== No hay solicitudes para procesar ===');
                process.exit(0);
            }

            // Se procesan las solicitudes
            for (const register of registers) {

                // Se cambia el estado de la solicitud a "VALIDANDO"
                await this.querys.changeStatus(register.idSolicitud, 'V');

                const response: AdresResponse = await runTask('ADRES/Adres', {
                    documentNumber: register.nit,
                    documentType: await this.querys.parserDocumentType(register.idTipoIdentificacion)
                });

                // Si es nulo, quiere decir que ocurrió un error, por lo que se pasa a estado "ERROR"
                if (response == null) {
                    console.log('=== Error al procesar la solicitud ===');
                    await this.querys.changeStatus(register.idSolicitud, 'E');
                    continue;
                }

                // Se crea la imagen y la ruta
                const path = await ParserUtil.buildAdresPath(register);
                const img = await ParserUtil.base64ToWebp(path, response.person.screenShot);

                // Si regresa false, es porque no encontró resultdos
                if (!response.success) {
                    console.log('=== No se encontraron resultados ===');

                    const dataToUpdate = {
                        mensajeErrorRPA: response.message,
                        fechaEjecucion: new Date(),
                        fechaFinalizacion: new Date(),
                        alerta: 'O',
                        urlResultado: img,
                        estado: 'F'
                    }

                    await this.querys.updateInfoRequest(register.idSolicitud, dataToUpdate);
                    continue;
                }

                // Si es positivo, se guardan los resultados
                if(response.success) {
                    console.log('=== Resultados encontrados ===');

                    // Validación de nombres usando Jaro-Winkler
                    const validacionNombres = ParserUtil.compararNombres(
                        {
                            nombre_1: register.nombre1 ?? '',
                            nombre_2: register.nombre2 ?? '',
                            apellido_1: register.apellido1 ?? '',
                            apellido_2: register.apellido2 ?? ''
                        },
                        response.person.names,
                        response.person.lastNames,
                        {
                            result_no: 'OK',
                            results_observ: 'OBSERVACION',
                            result_alert: 'ALERTA'
                        }
                    );

                    // Obtener IDs de departamento y ciudad
                    const departmentId = await this.querys.getDeparmentId(response.person.department);
                    const cityId = await this.querys.getCityId(response.person.city, departmentId);

                    const dataToUpdate = {
                        respuestaRPA: response.message,
                        fechaEjecucion: new Date(),
                        fechaFinalizacion: new Date(),
                        alerta: 'O',
                        urlResultado: img,
                        estado: 'F',
                        nombreCompletoConsultado: response.person.names + ' ' + response.person.lastNames,
                        departamentoRespuesta: response.person.department,
                        ciudadRespuesta: response.person.city,
                        epsRespuesta: response.person.epsName,
                        validacionNombres: validacionNombres.observacion,
                        idDepartamentoAdres: departmentId,
                        idCiudadAdres: cityId,
                    }

                    await this.querys.updateInfoRequest(register.idSolicitud, dataToUpdate);
                    continue;
                }

                // Si es desconocido, se lanza un error
                throw new Error('Respuesta desconocida');

            }
            
            await this.querys.close();
            process.exit(0);

        } catch (error) {
            console.error('Error en el proceso ADRES:', error);
        }

    }

}

export const start = async () => await (new AdresRPA).start();

if (require.main === module) {
    start();
}
