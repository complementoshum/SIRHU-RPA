import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { AdresRequest } from '../params/app.params';
import { ConnectionDB, DatabaseType } from '../database/Connection.db';
import AdresQuerys from '../database/ADRES/adres.querys';

export class ParserUtil {
 
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

}