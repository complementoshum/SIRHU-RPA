import { ConnectionDB, DatabaseType } from "../../database/Connection.db";
import { LICENSE_TABLES, PersonData, RecordStatus, ReminderStatus } from "../../params/ESTUDIO_ANTECEDENTES/Runt.params";
import { LicenseApproved, LicenseRejected, LicenseValidationResult, normalizeCategory, parseRuntDate } from "../../utils/LicenciasConduccion.util";

type SqlParam = string | number | boolean | Date | null;

export default class ValidadorLicenciasQuerys {

    protected connection = new ConnectionDB(DatabaseType.SIRHU);
    protected readonly masterDb = process.env.APP_DATABASE;
    protected readonly clientDb = process.env.APP_COMPLE;

    /** Usuario con el que se registran los campos de auditoría */
    protected readonly systemUser = 'RPA';

    /** Nombre completo (base.esquema.tabla) de la tabla de licencias */
    protected get licensesTable(): string {
        return `${this.clientDb}.dbo.${LICENSE_TABLES.licenses}`;
    }

    /** Nombre completo (base.esquema.tabla) de la tabla de categorías */
    protected get categoriesTable(): string {
        return `${this.clientDb}.dbo.${LICENSE_TABLES.categories}`;
    }

    /** Nombre completo (base.esquema.tabla) de la tabla de validaciones */
    protected get validationsTable(): string {
        return `${this.clientDb}.dbo.${LICENSE_TABLES.validations}`;
    }

    /** Nombre completo (base.esquema.tabla) de la tabla de procesos */
    protected get processTable(): string {
        return `${this.clientDb}.dbo.T_GH_procesos`;
    }

    /** Columnas de auditoría comunes a todas las tablas */
    private readonly auditColumns = `
        estado                      CHAR(1)             NOT NULL DEFAULT '${RecordStatus.ACTIVO}',
        usrRegistra                 VARCHAR(20)         NOT NULL,
        fechaHora                   SMALLDATETIME       NOT NULL DEFAULT GETDATE(),
        usrUpd                      VARCHAR(20)         NULL,
        fechaUltUpd                 SMALLDATETIME       NULL
    `;

    /**
     * @function createTableIfNotExists
     * @description Crea una tabla en la base del cliente (con sus índices) solo si aún no existe
     * @param tableName {string} Nombre de la tabla (sin base ni esquema)
     * @param columns {string} Definición de columnas propias de la tabla (las de auditoría se agregan automáticamente)
     * @param indexes {Record<string, string>} Índices a crear: sufijo del nombre => columnas
     * @returns {Promise<void>}
     */
    private async createTableIfNotExists(tableName: string, columns: string, indexes: Record<string, string>): Promise<void> {

        const fullName = `${this.clientDb}.dbo.${tableName}`;

        const indexesSql = Object.entries(indexes)
            .map(([suffix, indexColumns]) => `CREATE INDEX IX_${tableName}_${suffix} ON ${fullName} (${indexColumns});`)
            .join('\n                ');

        await this.connection.query(`
            IF OBJECT_ID(N'${fullName}', N'U') IS NULL
            BEGIN
                CREATE TABLE ${fullName} (${columns},
                    -- Auditoría${this.auditColumns}
                );

                ${indexesSql}
            END
        `);
    }

    /**
     * @function ensureLicenseTables
     * @description Valida que existan las tablas de licencias, categorías y validaciones en la base del cliente; si no existen, las crea
     * @returns {Promise<void>}
     */
    public async ensureLicenseTables(): Promise<void> {

        // Tabla de licencias: una fila por licencia aplicada a la persona en el proceso
        await this.createTableIfNotExists(LICENSE_TABLES.licenses, `
                    idLicencia                  INT IDENTITY(1,1)   NOT NULL PRIMARY KEY,
                    idProceso                   INT                 NOT NULL,
                    nit                         VARCHAR(16)         NOT NULL,
                    numeroLicencia              VARCHAR(50)         NOT NULL,
                    otExpide                    VARCHAR(200)        NULL,
                    fechaExpedicion             DATE                NULL,
                    estadoLicencia              VARCHAR(30)         NULL,
                    restricciones               VARCHAR(500)        NULL,
                    retencion                   VARCHAR(100)        NULL,
                    otCancelaSuspende           VARCHAR(200)        NULL,
                    categoriaRequerida          VARCHAR(5)          NOT NULL,
                    categoriaAplicada           VARCHAR(5)          NOT NULL,
                    fechaVencimientoAplicada    DATE                NULL,
                    -- Recordatorio de vencimiento (cronjob)
                    estadoRecordatorio          CHAR(1)             NOT NULL DEFAULT '${ReminderStatus.PENDIENTE}',
                    fechaUltRecordatorio        SMALLDATETIME       NULL,
                    cantRecordatorios           INT                 NOT NULL DEFAULT 0`,
            {
                nit_proceso: 'nit, idProceso',
                recordatorio: 'estadoRecordatorio, fechaVencimientoAplicada'
            }
        );

        // Tabla de categorías: una fila por cada categoría de la licencia (relacionada por idLicencia)
        await this.createTableIfNotExists(LICENSE_TABLES.categories, `
                    idLicenciaCategoria         INT IDENTITY(1,1)   NOT NULL PRIMARY KEY,
                    idLicencia                  INT                 NOT NULL,
                    idProceso                   INT                 NOT NULL,
                    nit                         VARCHAR(16)         NOT NULL,
                    numeroLicencia              VARCHAR(50)         NOT NULL,
                    categoria                   VARCHAR(5)          NOT NULL,
                    categoriaAntigua            VARCHAR(20)         NULL,
                    fechaExpedicion             DATE                NULL,
                    fechaVencimiento            DATE                NULL,
                    esCategoriaAplicada         BIT                 NOT NULL DEFAULT 0,
                    -- Recordatorio de vencimiento (cronjob)
                    estadoRecordatorio          CHAR(1)             NOT NULL DEFAULT '${ReminderStatus.NO_APLICA}',
                    fechaUltRecordatorio        SMALLDATETIME       NULL,
                    cantRecordatorios           INT                 NOT NULL DEFAULT 0`,
            {
                licencia: 'idLicencia',
                nit_proceso: 'nit, idProceso',
                recordatorio: 'estadoRecordatorio, fechaVencimiento'
            }
        );

        // Tabla de validaciones: resultado (apta / no apta) de cada validación por persona y proceso
        await this.createTableIfNotExists(LICENSE_TABLES.validations, `
                    idValidacion                INT IDENTITY(1,1)   NOT NULL PRIMARY KEY,
                    idProceso                   INT                 NOT NULL,
                    nit                         VARCHAR(16)         NOT NULL,
                    categoriaRequerida          VARCHAR(5)          NOT NULL,
                    apto                        BIT                 NOT NULL,
                    resultado                   VARCHAR(40)         NOT NULL,
                    mensaje                     VARCHAR(1000)       NULL,
                    idLicencia                  INT                 NULL`,
            {
                nit_proceso: 'nit, idProceso'
            }
        );
    }

    /**
     * @function getPersonsToValidate
     * @description Obtiene las personas cuya requisición exige licencia y que aún no han sido validadas
     * para esa categoría en el proceso (aptas o no aptas). Si cambia la categoría requerida, se vuelven a validar.
     * @returns {Promise<PersonData[]>} Personas a validar
     */
    public async getPersonsToValidate(): Promise<PersonData[]> {

        const processStatus = ["'P'","'AS'","'AC'","'PS'","'EM'","'EMC'","'S'","'B'"];
        const sSql = `
            SELECT TOP 10 s.apellido1 AS apellido, s.tipoIdentificacion, s.nit, d.bd, d.idBd, p.idProceso, r.licencia_requerida
            FROM ${this.masterDb}..T_RPA_ESSolicitudes AS s
            INNER JOIN ${this.clientDb}..T_GH_procesos AS p ON p.idSolicitud = s.idSolicitud
            INNER JOIN ${this.clientDb}..T_GH_requisiciones AS r ON r.idRequisicion = p.idRequisicion
            INNER JOIN ${this.masterDb}..T_G_appDatabases AS d ON d.idBd = s.idBd
            WHERE r.licencia_requerida IS NOT NULL
            AND s.estado IN (?, ?, ?)
            AND p.estado IN (${processStatus.join(',')})
            AND NOT EXISTS (
                SELECT 1 FROM ${this.validationsTable} AS v
                WHERE v.idProceso = p.idProceso
                AND v.nit = s.nit
                AND v.categoriaRequerida = UPPER(REPLACE(r.licencia_requerida, ' ', ''))
                AND v.estado = ?
            )
        `;

        return await this.connection.query<PersonData>(sSql, ['P', 'V', 'A', RecordStatus.ACTIVO]);
    }

    /**
     * @function saveApprovedLicense
     * @description Registra, en una única transacción, la licencia aplicada, todas sus categorías y la validación (apta)
     * @param person {PersonData} Persona validada
     * @param result {LicenseApproved} Resultado aprobado de la validación
     * @returns {Promise<number>} ID de la licencia registrada
     */
    public async saveApprovedLicense(person: PersonData, result: LicenseApproved): Promise<number> {

        const { licencia, categoria: appliedCategory, requiredCategory } = result;
        const nit = String(person.nit).trim();
        const appliedExpiration = parseRuntDate(appliedCategory.fechaVencimiento);

        // Solo la categoría aplicada con fecha de vencimiento queda pendiente de recordatorio
        const reminderFor = (expiration: Date | null, isApplied: boolean) =>
            isApplied && expiration ? ReminderStatus.PENDIENTE : ReminderStatus.NO_APLICA;

        const licenseParams: SqlParam[] = [
            person.idProceso,
            nit,
            licencia.numeroLicencia,
            licencia.otExpide || null,
            parseRuntDate(licencia.fechaExpedicion),
            licencia.estado?.trim() || null,
            licencia.restricciones || null,
            licencia.retencion || null,
            licencia.otCancelaSuspende || null,
            requiredCategory,
            normalizeCategory(appliedCategory.categoria),
            appliedExpiration,
            reminderFor(appliedExpiration, true),
            this.systemUser
        ];

        const categoriesParams: SqlParam[] = licencia.categorias.flatMap(categoria => {
            const isApplied = categoria === appliedCategory;
            const expiration = parseRuntDate(categoria.fechaVencimiento);

            return [
                person.idProceso,
                nit,
                licencia.numeroLicencia,
                normalizeCategory(categoria.categoria),
                categoria.categoriaAntigua || null,
                parseRuntDate(categoria.fechaExpedicion),
                expiration,
                isApplied,
                reminderFor(expiration, isApplied),
                this.systemUser
            ];
        });

        const categoriesValues = licencia.categorias
            .map(() => '(@idLicencia, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .join(',\n                ');

        const inactivate = this.buildInactivatePrevious(person);
        const validation = this.buildInsertValidation(person, result, '@idLicencia');

        const sSql = `
            SET XACT_ABORT ON;
            BEGIN TRANSACTION;

            DECLARE @idLicencia INT;

            ${inactivate.sql}

            INSERT INTO ${this.licensesTable} (
                idProceso, nit, numeroLicencia, otExpide, fechaExpedicion, estadoLicencia, restricciones,
                retencion, otCancelaSuspende, categoriaRequerida, categoriaAplicada, fechaVencimientoAplicada,
                estadoRecordatorio, usrRegistra
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

            SET @idLicencia = SCOPE_IDENTITY();

            INSERT INTO ${this.categoriesTable} (
                idLicencia, idProceso, nit, numeroLicencia, categoria, categoriaAntigua, fechaExpedicion,
                fechaVencimiento, esCategoriaAplicada, estadoRecordatorio, usrRegistra
            )
            VALUES
                ${categoriesValues};

            ${validation.sql}

            COMMIT TRANSACTION;

            SELECT @idLicencia AS idLicencia;
        `;

        const [inserted] = await this.connection.query<{ idLicencia: number }>(
            sSql,
            [...inactivate.params, ...licenseParams, ...categoriesParams, ...validation.params]
        );

        return inserted.idLicencia;
    }

    /**
     * @function saveRejectedValidation
     * @description Registra la validación de una persona NO apta, para que no vuelva a ser consultada en el RUNT
     * @param person {PersonData} Persona validada
     * @param result {LicenseRejected} Resultado rechazado de la validación
     * @returns {Promise<void>}
     */
    public async saveRejectedValidation(person: PersonData, result: LicenseRejected): Promise<void> {

        const inactivate = this.buildInactivatePrevious(person);
        const validation = this.buildInsertValidation(person, result, 'NULL');

        const sSql = `
            SET XACT_ABORT ON;
            BEGIN TRANSACTION;

            ${inactivate.sql}

            ${validation.sql}

            COMMIT TRANSACTION;
        `;

        await this.connection.query(sSql, [...inactivate.params, ...validation.params]);
    }

    /**
     * @function discardProcess
     * @description Descarta el proceso por no cumplir con la licencia requerida
     * @param person {PersonData} Persona descartada
     * @param cause {string} Causa del descarte
     * @returns {Promise<void>}
     */
    public async discardProcess(person: PersonData, cause: string): Promise<void> {
        const discard = this.buildDiscardProcess(person, cause);
        await this.connection.query(discard.sql, discard.params);
    }

    /* ::::::::::::::::::::::::::: BUILDERS ::::::::::::::::::::::::::: */

    /**
     * @function buildInactivatePrevious
     * @description Construye el SQL que inactiva los registros activos previos (licencias, categorías y validaciones)
     * de la persona en el proceso, para que solo quede vigente el resultado de la validación más reciente
     * @param person {PersonData} Persona validada
     * @returns {{ sql: string, params: SqlParam[] }} Sentencias y parámetros
     */
    private buildInactivatePrevious(person: PersonData): { sql: string; params: SqlParam[] } {

        const tables = [this.licensesTable, this.categoriesTable, this.validationsTable];
        const nit = String(person.nit).trim();

        return {
            sql: tables.map(table => `
            UPDATE ${table}
            SET estado = ?, usrUpd = ?, fechaUltUpd = GETDATE()
            WHERE idProceso = ? AND nit = ? AND estado = ?;`).join('\n'),
            params: tables.flatMap(() => [RecordStatus.INACTIVO, this.systemUser, person.idProceso, nit, RecordStatus.ACTIVO])
        };
    }

    /**
     * @function buildInsertValidation
     * @description Construye el SQL que registra el resultado de la validación en la bitácora
     * @param person {PersonData} Persona validada
     * @param result {LicenseValidationResult} Resultado de la validación
     * @param idLicenciaExpression {string} Expresión SQL con el ID de la licencia registrada ('@idLicencia' o 'NULL')
     * @returns {{ sql: string, params: SqlParam[] }} Sentencia y parámetros
     */
    private buildInsertValidation(person: PersonData, result: LicenseValidationResult, idLicenciaExpression: string): { sql: string; params: SqlParam[] } {
        return {
            sql: `
            INSERT INTO ${this.validationsTable} (
                idProceso, nit, categoriaRequerida, apto, resultado, mensaje, idLicencia, usrRegistra
            )
            VALUES (?, ?, ?, ?, ?, ?, ${idLicenciaExpression}, ?);`,
            params: [
                person.idProceso,
                String(person.nit).trim(),
                result.requiredCategory,
                result.approved,
                result.status,
                result.message.slice(0, 1000),
                this.systemUser
            ]
        };
    }

    /**
     * @function buildDiscardProcess
     * @description Construye el SQL que descarta el proceso por no cumplir con la licencia requerida
     * @param person {PersonData} Persona descartada
     * @param cause {string} Causa del descarte
     * @returns {{ sql: string, params: SqlParam[] }} Sentencia y parámetros
     */
    private buildDiscardProcess(person: PersonData, cause: string): { sql: string; params: SqlParam[] } {
        return {
            sql: `
            UPDATE ${this.processTable}
            SET estado = ?, causaDescarte = ?
            WHERE idProceso = ?;`,
            params: [
                'DES', // Estado de DESCARTADO por antecedentes
                cause,
                person.idProceso
            ]
        };
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
