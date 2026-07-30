import { ConnectionDB } from "../database/Connection.db";
import { PersonInterface } from "../tasks/ESTUDIO_ANTECEDENTES/MedidasCorrectivas.task";
import { runTask, RunTaskResponse } from "../core/TaskRunner";
import Mailer from "../utils/Mailer.util";

class SiamoRPA {

    protected connection = new ConnectionDB();

    public async start() {
        this.getPersonsToValidate()
    }

    private async getPersonsToValidate() {

        const maxSolToProcess = parseInt(process.env.MAX_SOL_TO_PROCESS || '5');
        const solToProcessCount = parseInt(process.env.SOL_TO_PROCESS_COUNT || '2');

        // Personas validando
        const inProcess = await this.connection.query(
            'SELECT COUNT(*) AS number FROM T_G_verificacion_RPA WHERE estado_RPA = ?',
            ['V']
        );

        if ((inProcess as any)[0].number >= maxSolToProcess) {
            console.log('Maximum number of solutions to process reached');
            return;
        }

        // Personas a validar
        const toValidate = await this.connection.query(
            `SELECT TOP ${solToProcessCount} vrpa.*, usr.email 
            FROM T_G_verificacion_RPA AS vrpa
            INNER JOIN T_G_usrs AS usr ON usr.usr = vrpa.documento
            WHERE vrpa.estado_RPA = ?`,
            ['P']
        );

        if (toValidate.length == 0) {
            console.log('No persons to validate');
            return;
        }

        // Se ejecuta la automatización para cada persona
        for (const person of toValidate) {

            const expeditionDate = (person as any).fecha_expedicion;
            let formattedDate: string;

            if (expeditionDate instanceof Date) {
                const day = String(expeditionDate.getUTCDate()).padStart(2, '0');
                const month = String(expeditionDate.getUTCMonth() + 1).padStart(2, '0');
                const year = expeditionDate.getUTCFullYear();
                formattedDate = `${day}/${month}/${year}`;
            } else {
                formattedDate = String(expeditionDate);
            }

            const personData: PersonInterface = {
                id: (person as any).id,
                documentType: (person as any).id_tipo_identificacion,
                documentNumber: String((person as any).documento),
                docuemntExpeditionDate: formattedDate,
                firstName: (person as any).primer_nombre,
                middleName: (person as any).segundo_nombre,
                lastName: (person as any).primer_apellido,
                middleLastName: (person as any).segundo_apellido,
                email: (person as any).email,
            }

            // Si no es cedula, se marca como invalido y se continua
            if (personData.documentType != 'C') {
                await this.connection.query(
                    `UPDATE T_G_verificacion_RPA SET rpa_msg_response = ? WHERE id = ?, estado_RPA = ?`,
                    ['El tipo de documento no es Cédula de Ciudadanía', personData.id, 'F']
                );
                continue;
            }

            // Se cambia el estado a "Validando"
            await this.connection.query(
                `UPDATE T_G_verificacion_RPA SET estado_RPA = ? WHERE id = ?`,
                ['V', personData.id]
            );

            // Se ejecutan las tareas
            const response: RunTaskResponse = await runTask('ESTUDIO_ANTECEDENTES/MedidasCorrectivas', personData);
            const status = response.success ? 'F' : 'R';
            
            // Se actualiza el estado de la validacion y la respuesta
            await this.connection.query(
                `UPDATE T_G_verificacion_RPA SET estado_RPA = ?, rpa_msg_response = ?, fecha_ejecucion_RPA = GETDATE() WHERE id = ?`,
                [status, response.message, personData.id]
            );

            // Si es positiva la validación, se envia un correo
            await (new Mailer).send({
                to: personData.email!,
                subject: response.success ? 'Verificación SIAMO' : 'Error en Verificación SIAMO',
                template: 'SIAMO/verifify.template.html',
                data: {
                    nombre: [
                        personData.firstName, 
                        personData.middleName, 
                        personData.lastName, 
                        personData.middleLastName
                    ].filter(Boolean).join(' ').toUpperCase(),
                    mensaje: response.success 
                        ? 'Su información ha sido validada correctamente. Puede continuar con el proceso.'
                        : 'No se pudo validar la información suministrada con anterioridad; detalle: ' + response.message
                }
            });
            
        }

        await this.connection.close();

    }

}


export const start = async () => await (new SiamoRPA).start();

if (require.main === module) {
    start();
}
