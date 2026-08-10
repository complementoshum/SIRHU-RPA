export interface RiskListInterface {
  idLista: number;
  nombre: string;
  urlLista: string;
  descripcion: string;
  fechaHora: string;
  estado: 'A' | 'I' | string;
  usrRegistra: string;
  fechaUltUpd: string | null;
  esListaRiesgo: number | boolean;
  userLogin: string | null;
  passwordLogin: string | null;
  msgNoResultado: string | null;
  msgNoCaptcha: string | null;
  siteCaptchaKey: string | null;
  usrUpd: string | null;
  orden: number;
}

export interface AdresRequest {
  idSolicitud: number;
  idTipoIdentificacion: string;
  nit: string;
  apellido1: string | null;
  apellido2: string | null;
  nombre1: string | null;
  nombre2: string | null;
  genero: 'M' | 'F' | string | null;
  fechaExpedicionDoc: string | null;
  nombreCompletoConsultado: string | null;
  idExterno: number | string | null;
  usrRegistra: string;
  mensajeErrorRPA: string | null;
  fechaHora: string;
  fechaUltUpd: string | null;
  fechaEjecucion: string | null;
  fechaFinalizacion: string | null;
  estado: 'P' | 'E' | 'C' | 'F' | string;
  departamentoRespuesta: string | null;
  ciudadRespuesta: string | null;
  epsRespuesta: string | null;
  respuestaRPA: string | Record<string, unknown> | null;
  alerta: string | null;
  urlResultado: string | null;
  validacionNombres: string | boolean | null;
  idDepartamentoAdres: number | string | null;
  idCiudadAdres: number | string | null;
  idNomina: number | null;
  idBd: number;
}
