import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { jaroWinkler } from 'jaro-winkler-typescript';
import { AdresRequest } from '../params/app.params';
import { ConnectionDB, DatabaseType } from '../database/Connection.db';
import AdresQuerys from '../database/ADRES/adres.querys';

interface DatosRpa {
    nombre_1?: string;
    nombre_2?: string;
    apellido_1?: string;
    apellido_2?: string;
}

interface MsgResults {
    result_no: string;
    results_observ: string;
    result_alert: string;
}

interface CompararNombresResult {
    porcentaje: number;
    resultado: string;
    observacion: string;
    nombre_registrado: string;
    nombre_consultado: string;
}

export class ParserUtil {
 
    
    /**
     * @function SiamoDocumentToMD
     * @description Convierte un tipo de documento de SIOAM a Medidas Correctivas
     * @param documentType {string} Tipo de documento de SIOAM
     * @returns {string} Tipo de documento de Medidas Correctivas
     */
    public static SiamoDocumentToMD(documentType: string): string {

        // Mapeo de tipos de documento de SIOAM a tipos de documento de MD
        const diccionary: { [key: string]: string } = {
            "N": "1", // NIT
            "C": "55", // Cédula de Ciudadanía
            "E": "57", // Cédula de Extranjería
            "PT": "842", // Permisos por Protección Temporal
            "P": "58", // Pasaporte
            "T": "56" // Tarjeta de Identidad
        }

        return diccionary[documentType];
    }

    /**
     * @function buildAdresPath
     * @description Construye la ruta para guardar los archivos de ADRES
     * @param request {AdresRequest} Request de ADRES
     * @returns {Promise<string>} Ruta para guardar los archivos de ADRES
     */
    public static async buildAdresPath(request: AdresRequest): Promise<string> {

        const basePath = process.env.ADRES_PATH_TO_SAVE || null;
        if (!basePath) throw new Error('ADRES_PATH_TO_SAVE environment variable is not set');
        
        const connection = new ConnectionDB(DatabaseType.SIRHU)
        const env = process.env.ENVIROMENT || 'sandbox';
        const dataBase: any = await connection.query(`SELECT bd FROM T_G_appDatabases WHERE idBd = ?`, [request.idBd]);

        if(!env || !dataBase[0].bd || !request.idNomina || !request.idSolicitud) {
            throw new Error('env, database, idNomina and idSolicitud are required', {
                cause: {
                    env,
                    database: dataBase[0].bd,
                    idNomina: request.idNomina,
                    idSolicitud: request.idSolicitud
                }
            });
        }

        connection.close();

        return basePath.replaceAll('{env}', env.trim())
                        .replaceAll('{dataBaseName}', dataBase[0].bd.trim())
                        .replaceAll('{nit}', request.nit.toString().trim())
                        .replaceAll('{nomiId}', request.idNomina.toString().trim())
                        .replaceAll('{soliAdresId}', request.idSolicitud.toString().trim())
                        .replaceAll('{listId}', (new AdresQuerys()).getListId.toString())
                        .replaceAll('{date}', new Date().toLocaleDateString(
                            'es-ES', 
                            { day: '2-digit', month: '2-digit', year: 'numeric' }
                        ).replace(/\//g, ''))
    }

    /**
     * @function base64ToWebp
     * @description Convierte una imagen en base64 a webp
     * @param filePath {string} Ruta del archivo
     * @param base64 {string} Imagen en base64
     * @returns {Promise<string>} Ruta del archivo webp
     */
    public static async base64ToWebp(filePath: string, base64: string): Promise<string> {
        const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');
        
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const outputPath = filePath.endsWith('.webp') ? filePath : `${filePath}.webp`;

        await sharp(imageBuffer)
            .webp({ quality: 80 })
            .toFile(outputPath);

        return outputPath;
    }

    /**
     * Normaliza un texto removiendo acentos, convirtiendo a minúsculas y opcionalmente
     * quitando puntuación y/o espacios.
     * 
     * @param texto - Texto a normalizar
     * @param quitarPuntuacion - Si es true, elimina caracteres de puntuación
     * @param eliminarEspacios - Si es true, elimina todos los espacios
     * @returns Texto normalizado
     */
    private static normalizarTexto(
        texto: string,
        quitarPuntuacion: boolean = false,
        eliminarEspacios: boolean = false
    ): string {
        if (!texto) return '';

        // Normalizar a NFD y remover diacríticos (acentos)
        let normalizado = texto
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();

        if (quitarPuntuacion) {
            normalizado = normalizado.replace(/[^\w\s]/g, '');
        }

        if (eliminarEspacios) {
            normalizado = normalizado.replace(/\s+/g, '');
        }

        return normalizado;
    }

    /**
     * Compara nombres registrados con nombres consultados usando similitud fonética (Jaro-Winkler).
     * 
     * @param datosRpa - Diccionario con claves 'nombre_1', 'nombre_2', 'apellido_1', 'apellido_2'
     * @param nombresCompletos - Nombres completos obtenidos en la consulta
     * @param apellidosCompletos - Apellidos completos obtenidos en la consulta
     * @param msgResults - Diccionario con mensajes predefinidos para cada tipo de resultado
     * @param umbralCoincidencia - Porcentaje mínimo de coincidencia para considerarse válido (default: 80)
     * @returns Objeto con porcentaje, resultado, observación y nombres comparados
     */
    public static compararNombres(
        datosRpa: DatosRpa,
        nombresCompletos: string,
        apellidosCompletos: string,
        msgResults: MsgResults,
        umbralCoincidencia: number = 80
    ): CompararNombresResult {
        // Construcción y normalización de nombres registrados
        const nombresReg = `${datosRpa.nombre_1 || ''} ${datosRpa.nombre_2 || ''}`.trim();
        const apellidosReg = `${datosRpa.apellido_1 || ''} ${datosRpa.apellido_2 || ''}`.trim();

        const nombresRegNorm = this.normalizarTexto(nombresReg, true);
        const apellidosRegNorm = this.normalizarTexto(apellidosReg, true);
        const nombresConsNorm = this.normalizarTexto(nombresCompletos, true);
        const apellidosConsNorm = this.normalizarTexto(apellidosCompletos, true);

        // Nombre completo para la comparación
        const completoReg = `${nombresRegNorm} ${apellidosRegNorm}`.trim();
        const completoCons = `${nombresConsNorm} ${apellidosConsNorm}`.trim();

        // Calcular porcentaje de coincidencia usando Jaro-Winkler
        const similitud = jaroWinkler(
            this.normalizarTexto(completoCons, false, true),
            this.normalizarTexto(completoReg, false, true),
            { caseSensitive: false }
        );
        const coincidencia = Math.round(similitud * 100 * 100) / 100; // Redondear a 2 decimales

        // Determinar observación y resultado
        let resultado: string;
        let observacion: string;

        if (coincidencia === 100) {
            resultado = msgResults.result_no;
            observacion = 'El nombre coincide un 100%';
        } else if (coincidencia >= umbralCoincidencia) {
            resultado = msgResults.results_observ;
            observacion = `${completoReg} coincide un ${coincidencia}% con ${completoCons}`;
        } else {
            resultado = msgResults.result_alert;
            observacion = `${completoReg} no coincide con ${completoCons}`;
        }

        return {
            porcentaje: coincidencia,
            resultado,
            observacion,
            nombre_registrado: completoReg,
            nombre_consultado: completoCons
        };
    }

}