export default {
    // Login
    // Search
    // Download
}

export interface InfolaftQuery {
    id: number;
    idBd: number;
    idProceso: number;
    idInfolaft: number;
    nit: number;
    usrRegistra: number;
    fechaHora: string;
    rutaArchivo: string | null;
    fechaFinalizacion: string | null;
    estado: string;
    idNomina: number;
    dataApi: string | null;
    resultado: string | null;
    usrFinaliza: string | null;
    observaciones: string | null;
}
