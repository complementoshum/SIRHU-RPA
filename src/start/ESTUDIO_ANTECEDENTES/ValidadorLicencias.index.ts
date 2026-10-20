import { runTask } from "../../core/TaskRunner";
import ValidadorLicenciasQuerys from "../../database/ESTUDIO_ANTECEDENTES/ValidadorLicencias.querys";
import { MAPEO_TIPO_DOCUMENTO_PERSONA, PersonData } from "../../params/ESTUDIO_ANTECEDENTES/Runt.params";
import type { RuntLicencia, RuntRequest } from "../../tasks/ESTUDIO_ANTECEDENTES/Runt.task";
import { LicenseRejected, validateDriverLicense } from "../../utils/LicenciasConduccion.util";

class ValidadorLicencias {

    protected querys = new ValidadorLicenciasQuerys();

    /**
     * @function start
     * @description Función principal: valida la licencia de conducción de cada persona pendiente
     * @returns {Promise<void>}
     */
    public async start(): Promise<void> {

        try {

            console.log('=== Validador de licencias iniciado ===');

            // Se garantiza que existan las tablas donde se registran las licencias
            await this.querys.ensureLicenseTables();

            // Se obtienen las personas cuya requisición exige licencia
            const persons = await this.querys.getPersonsToValidate();

            if (persons.length === 0) {
                console.log('== No hay personas para validar ==');
                return;
            }

            console.log('== Personas a validar:', persons.length, '==');

            // Se procesa cada persona de forma independiente para que un error no detenga el lote
            for (const person of persons) {
                await this.processPerson(person);
            }

        } catch (error) {
            console.error('Error al validar licencias:', error);
        } finally {
            await this.querys.close();
            process.exit(0);
        }
    }

    /**
     * @function processPerson
     * @description Consulta las licencias de la persona en el RUNT, las valida y registra o descarta según el resultado
     * @param person {PersonData} Persona a validar
     * @returns {Promise<void>}
     */
    private async processPerson(person: PersonData): Promise<void> {

        const label = `[Proceso ${person.idProceso} | NIT ${person.nit}]`;

        try {

            console.log(`${label} Consultando licencias (requerida: ${person.licencia_requerida})`);

            // 1. Consulta de licencias en el RUNT
            const licencias = await this.consultLicenses(person);

            // 2. Validación de licencia activa y categoría requerida (o superior)
            const result = validateDriverLicense(licencias, person.licencia_requerida);

            // 3. Si no cumple, se registra la validación (para no volver a consultarla) y se descarta del proceso
            if (!result.approved) {
                console.log(`${label} No cumple: ${result.status} - ${result.message}`);
                await this.querys.saveRejectedValidation(person, result);
                await this.discardProcessPerson(person, result);
                return;
            }

            // 4. Si cumple, se registra la licencia aplicada con sus categorías y la validación
            const idLicencia = await this.querys.saveApprovedLicense(person, result);
            console.log(`${label} ${result.message}. Registrada con idLicencia ${idLicencia}`);

        } catch (error) {
            console.error(`${label} Error validando licencia:`, error);
        }
    }

    /**
     * @function consultLicenses
     * @description Ejecuta la tarea del RUNT para obtener las licencias de la persona
     * @param person {PersonData} Persona a consultar
     * @returns {Promise<RuntLicencia[] | null>} Licencias encontradas o null si no tiene
     */
    private async consultLicenses(person: PersonData): Promise<RuntLicencia[] | null> {

        const documentType = MAPEO_TIPO_DOCUMENTO_PERSONA[person.tipoIdentificacion?.trim()];
        const documentNumber = String(person.nit ?? '').trim();
        const firtslastName = person.apellido?.trim().split(/\s+/)[0];

        if (!documentType) throw new Error(`Tipo de identificación no soportado por el RUNT: "${person.tipoIdentificacion}"`);
        if (!documentNumber || !firtslastName) throw new Error('Faltan datos (documento o apellido) para consultar el RUNT');

        return await runTask<RuntRequest, RuntLicencia[] | null>('ESTUDIO_ANTECEDENTES/Runt', {
            documentType,
            documentNumber,
            firtslastName
        });
    }

    /**
     * @function discardProcessPerson
     * @description Descarta a la persona del proceso por no cumplir con la licencia requerida.
     * Pendiente de integración: aquí se debe actualizar el estado del proceso con el motivo (result.message / result.status).
     * @param person {PersonData} Persona a descartar
     * @param result {LicenseRejected} Resultado de la validación con el motivo del descarte
     * @returns {Promise<void>}
     */
    private async discardProcessPerson(person: PersonData, result: LicenseRejected): Promise<void> {
        await this.querys.discardProcess(person, result.message);
    }

}

export const start = async () => await (new ValidadorLicencias).start();

if (require.main === module) {
    start();
}
