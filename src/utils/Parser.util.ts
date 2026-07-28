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

}