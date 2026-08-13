import { ConnectionDB, DatabaseType } from "../../database/Connection.db";
import { AdresRequest } from "../../params/app.params";

export default class AdresQuerys {

    protected connection = new ConnectionDB(DatabaseType.SIRHU);
    protected listId: number = 24

    /**
     * @function getListId
     * @description Obtiene el ID de la lista
     * @returns {number} ID de la lista
     */
    get getListId(): number {
        return this.listId;
    }

    /**
     * @function getValidSol
     * @description Valida si no se ha alcanzado el maximo de solicitudes en procesamiento
     * @returns {Promise<boolean>} true si se puede procesar una nueva solicitud, false en caso contrario
     */
    public async getValidSol(): Promise<boolean> {

        const maxSolToProcess = process.env.MAX_SOL_TO_PROCESS || 10

        const response: any = await this.connection.query(`SELECT COUNT(idSolicitud) AS registers FROM T_RPA_AdresSolicitudes WHERE estado = ?`, ['V'])

        if (response[0].registers >= maxSolToProcess) return false;

        return true;
    }

    /**
     * @function isActiveList
     * @description Valida si la lista esta activa
     * @returns {Promise<boolean>} true si la lista esta activa, false en caso contrario
     */
    public async isActiveList(): Promise<boolean> {

        const response: any = await this.connection.query(`SELECT estado FROM T_RPA_ListasRiesgo WHERE idLista = ?`, [this.listId])

        if (response[0].estado === 'A') return true;

        return false;

    }

    /**
     * @function getRegisters
     * @description Obtiene los registros de solicitudes pendientes
     * @returns {Promise<AdresRequest[]>} Array de registros de solicitudes pendientes
     */
    public async getRegisters(): Promise<AdresRequest[]> {
        const solToProcess: number = parseInt(process.env.SOL_TO_PROCESS || '1')
        return await this.connection.query(`SELECT TOP ${solToProcess} * FROM T_RPA_AdresSolicitudes WHERE estado = ? ORDER BY fechaHora DESC`, ['P']) as AdresRequest[];
    }

    /**
     * @function changeStatus
     * @description Cambia el estado de una solicitud
     * @param idSolicitud {number} ID de la solicitud
     * @param status {string} Nuevo estado
     * @returns {Promise<void>}
     */
    public async changeStatus(idSolicitud: number, status: string): Promise<void> {
        await this.connection.query(`UPDATE T_RPA_AdresSolicitudes SET estado = ? WHERE idSolicitud = ?`, [status, idSolicitud])
    }

    /**
     * @function parserDocumentType
     * @description Convierte el tipo de documento de SIRHU a ADRES
     * @param documentType {string} Tipo de documento de SIRHU
     * @returns {Promise<string>} Tipo de documento de ADRES
     */
    public async parserDocumentType(documentType: string): Promise<string> {
        const response = await this.connection.query(`SELECT idTipoDocAdres FROM T_G_tiposIdentificacion WHERE idTipoIdentificacion = ?`, [documentType]) as any[]
        return response[0].idTipoDocAdres ?? 'CC'
    }

    /**
     * @function updateInfoRequest
     * @description Actualiza la información de una solicitud
     * @param idSolicitud {number} ID de la solicitud
     * @param data {Record<string, string | number | boolean | Date | null>} Datos a actualizar
     * @returns {Promise<any>}
     */
    public async updateInfoRequest(idSolicitud: number, data: Record<string, string | number | boolean | Date | null>): Promise<any> {
        const keys = Object.keys(data);
        const values = Object.values(data);
        await this.connection.query(`UPDATE T_RPA_AdresSolicitudes SET ${keys.join(' = ?, ')} = ? WHERE idSolicitud = ?`, [...values, idSolicitud])
    }

    /**
     * @function getDeparmentId
     * @description Obtiene el ID de un departamento
     * @param description {string} Descripción del departamento
     * @returns {Promise<string>} ID del departamento
     */
    public async getDeparmentId(description: string): Promise<string> {
        if (description.toUpperCase().includes('D.C.')) {
            description = 'BOGOTA'
        }
        const response = await this.connection.query(`SELECT idDepartamento FROM T_G_departamentos WHERE descripcion LIKE CONCAT('%', ?, '%')`, [description]) as any[]
        return response[0].idDepartamento ?? ''
    }

    /**
     * @function getCityId
     * @description Obtiene el ID de una ciudad
     * @param description {string} Descripción de la ciudad
     * @param departmentId {string} ID del departamento
     * @returns {Promise<string>} ID de la ciudad
     */
    public async getCityId(description: string, departmentId: string): Promise<string> {
        if (description.toUpperCase().includes('D.C.')) {
            description = 'BOGOTA'
        }
        if (description.toUpperCase().includes('SANTIAGO DE CALI')) {
            description = 'CALI'
        }
        const response = await this.connection.query(`SELECT idCiudad FROM T_G_ciudades WHERE descripcion LIKE CONCAT('%', ?, '%') AND idDepartamento = ?`, [description, departmentId]) as any[]
        return response[0].idCiudad ?? ''
    }

    /**
     * @function close
     * @description Cierra la conexión con la base de datos
     * @returns {Promise<void>}
     */
    public async close(): Promise<void> {
        await this.connection.close();
    }

}