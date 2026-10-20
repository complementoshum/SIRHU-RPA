import { CATEGORY_ORDER } from "../params/ESTUDIO_ANTECEDENTES/Runt.params";
import type { RuntCategoria, RuntLicencia } from "../tasks/ESTUDIO_ANTECEDENTES/Runt.task";

/** Estado que reporta el RUNT para una licencia vigente */
const ACTIVE_LICENSE_STATUS = 'ACTIVA';

/**
 * Grupos de categorías que satisfacen a cada grupo requerido:
 * - A (motos): solo categorías A.
 * - B (carros): categorías B o C (la C es superior a la B).
 * - C (carros y camiones): solo categorías C.
 * Dentro de un mismo grupo se aplica la jerarquía por nivel (1 < 2 < 3).
 */
const COMPATIBLE_GROUPS: Record<string, readonly string[]> = {
    A: ['A'],
    B: ['B', 'C'],
    C: ['C']
};

/**
 * Posibles resultados de la validación de licencia de una persona.
 */
export enum LicenseValidationStatus {
    APROBADA = 'APROBADA',
    CATEGORIA_REQUERIDA_INVALIDA = 'CATEGORIA_REQUERIDA_INVALIDA',
    SIN_LICENCIA = 'SIN_LICENCIA',
    SIN_LICENCIA_ACTIVA = 'SIN_LICENCIA_ACTIVA',
    CATEGORIA_NO_CUMPLE = 'CATEGORIA_NO_CUMPLE',
    CATEGORIA_VENCIDA = 'CATEGORIA_VENCIDA'
}

/** Resultado cuando la persona cumple con la licencia requerida */
export interface LicenseApproved {
    approved: true;
    status: LicenseValidationStatus.APROBADA;
    message: string;
    requiredCategory: string;
    licencia: RuntLicencia;
    categoria: RuntCategoria;
}

/** Resultado cuando la persona NO cumple con la licencia requerida */
export interface LicenseRejected {
    approved: false;
    status: Exclude<LicenseValidationStatus, LicenseValidationStatus.APROBADA>;
    message: string;
    requiredCategory: string;
}

export type LicenseValidationResult = LicenseApproved | LicenseRejected;

/** Categoría descompuesta en grupo (A, B, C) y nivel (1, 2, 3) */
interface ParsedCategory {
    group: string;
    level: number;
}

/** Par licencia/categoría candidato a cumplir el requisito */
interface LicenseCandidate {
    licencia: RuntLicencia;
    categoria: RuntCategoria;
}

/**
 * @function normalizeCategory
 * @description Normaliza una categoría eliminando espacios y pasándola a mayúsculas (ej: " b 1" -> "B1")
 * @param value {string} Categoría a normalizar
 * @returns {string} Categoría normalizada
 */
export function normalizeCategory(value: string | null | undefined): string {
    return (value ?? '').replace(/\s+/g, '').toUpperCase();
}

/**
 * @function parseCategory
 * @description Descompone una categoría en grupo y nivel, validando que exista en CATEGORY_ORDER
 * @param value {string} Categoría a descomponer
 * @returns {ParsedCategory | null} Categoría descompuesta o null si no es válida
 */
function parseCategory(value: string | null | undefined): ParsedCategory | null {
    const code = normalizeCategory(value);
    if (!CATEGORY_ORDER.includes(code)) return null;
    return { group: code.charAt(0), level: Number(code.slice(1)) };
}

/**
 * @function categoryRank
 * @description Obtiene la posición de la categoría en CATEGORY_ORDER (-1 si no existe)
 * @param value {string} Categoría
 * @returns {number} Posición de la categoría
 */
function categoryRank(value: string): number {
    return CATEGORY_ORDER.indexOf(normalizeCategory(value));
}

/**
 * @function categorySatisfies
 * @description Indica si una categoría que posee la persona cumple con la categoría requerida
 * @param held {string} Categoría que posee la persona
 * @param required {string} Categoría requerida
 * @returns {boolean} true si la categoría cumple con la requerida
 */
export function categorySatisfies(held: string, required: string): boolean {

    const heldCategory = parseCategory(held);
    const requiredCategory = parseCategory(required);

    if (!heldCategory || !requiredCategory) return false;

    // Mismo grupo: aplica la jerarquía por nivel
    if (heldCategory.group === requiredCategory.group) return heldCategory.level >= requiredCategory.level;

    // Grupo diferente: solo aplica si es un grupo superior compatible (ej: C cubre B)
    return COMPATIBLE_GROUPS[requiredCategory.group]?.includes(heldCategory.group) ?? false;
}

/**
 * @function parseRuntDate
 * @description Convierte una fecha del RUNT (dd/mm/yyyy) a Date (UTC, sin hora)
 * @param value {string} Fecha en formato dd/mm/yyyy
 * @returns {Date | null} Fecha convertida o null si no es válida
 */
export function parseRuntDate(value: string | null | undefined): Date | null {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((value ?? '').trim());
    if (!match) return null;

    const [, day, month, year] = match;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

/**
 * @function todayInBogota
 * @description Obtiene la fecha actual de Colombia (UTC, sin hora) para comparar vencimientos
 * @returns {Date} Fecha actual
 */
export function todayInBogota(): Date {
    const today = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Bogota' }).format(new Date());
    return parseRuntDate(today) as Date;
}

/**
 * @function isLicenseActive
 * @description Indica si la licencia se encuentra en estado ACTIVA en el RUNT
 * @param licencia {RuntLicencia} Licencia a validar
 * @returns {boolean} true si la licencia está activa
 */
export function isLicenseActive(licencia: RuntLicencia): boolean {
    return licencia.estado?.trim().toUpperCase() === ACTIVE_LICENSE_STATUS;
}

/**
 * @function isCategoryInForce
 * @description Indica si la categoría está vigente según SU PROPIA fecha de vencimiento (no la de la licencia).
 * Si la categoría no tiene una fecha de vencimiento válida, no se puede garantizar su vigencia y se considera no vigente.
 * @param categoria {RuntCategoria} Categoría a validar
 * @param today {Date} Fecha de referencia
 * @returns {boolean} true si la categoría vence hoy o después
 */
export function isCategoryInForce(categoria: RuntCategoria, today: Date): boolean {
    const expiration = parseRuntDate(categoria.fechaVencimiento);
    return expiration !== null && expiration.getTime() >= today.getTime();
}

/**
 * @function compareCandidates
 * @description Ordena candidatos priorizando el vencimiento más lejano y luego la categoría más alta
 * @param a {LicenseCandidate} Candidato A
 * @param b {LicenseCandidate} Candidato B
 * @returns {number} Resultado de la comparación para Array.sort
 */
function compareCandidates(a: LicenseCandidate, b: LicenseCandidate): number {
    const expirationOf = ({ categoria }: LicenseCandidate) =>
        parseRuntDate(categoria.fechaVencimiento)?.getTime() ?? 0;

    const byExpiration = expirationOf(b) - expirationOf(a);
    if (byExpiration) return byExpiration;

    return categoryRank(b.categoria.categoria) - categoryRank(a.categoria.categoria);
}

/**
 * @function validateDriverLicense
 * @description Valida si la persona tiene una licencia activa con la categoría requerida (o una superior) vigente
 * @param licencias {RuntLicencia[] | null} Licencias consultadas en el RUNT
 * @param requiredCategory {string} Categoría requerida por la requisición
 * @param today {Date} Fecha de referencia para validar vencimientos
 * @returns {LicenseValidationResult} Resultado de la validación
 */
export function validateDriverLicense(
    licencias: RuntLicencia[] | null,
    requiredCategory: string,
    today: Date = todayInBogota()
): LicenseValidationResult {

    const required = normalizeCategory(requiredCategory);

    const reject = (status: LicenseRejected['status'], message: string): LicenseRejected =>
        ({ approved: false, status, message, requiredCategory: required });

    // 1. La categoría requerida debe ser una categoría conocida
    if (!parseCategory(required)) {
        return reject(LicenseValidationStatus.CATEGORIA_REQUERIDA_INVALIDA, `La categoría requerida "${requiredCategory}" no es válida`);
    }

    // 2. La persona debe tener al menos una licencia registrada
    if (!licencias?.length) {
        return reject(LicenseValidationStatus.SIN_LICENCIA, 'La persona no tiene licencias de conducción registradas en el RUNT');
    }

    // 3. Debe existir al menos una licencia activa
    const activeLicenses = licencias.filter(isLicenseActive);

    if (!activeLicenses.length) {
        return reject(LicenseValidationStatus.SIN_LICENCIA_ACTIVA, 'La persona no tiene licencias de conducción activas');
    }

    // 4. Alguna licencia activa debe tener la categoría requerida o una superior
    const matchingCandidates: LicenseCandidate[] = activeLicenses.flatMap(licencia =>
        licencia.categorias
            .filter(categoria => categorySatisfies(categoria.categoria, required))
            .map(categoria => ({ licencia, categoria }))
    );

    if (!matchingCandidates.length) {
        return reject(LicenseValidationStatus.CATEGORIA_NO_CUMPLE, `Ninguna licencia activa tiene la categoría ${required} o una superior`);
    }

    // 5. La categoría que cumple debe estar vigente (se valida la fecha de vencimiento de la categoría, no la de la licencia)
    const inForceCandidates = matchingCandidates.filter(({ categoria }) => isCategoryInForce(categoria, today));

    if (!inForceCandidates.length) {
        const expiredCategories = matchingCandidates
            .map(({ categoria }) => `${normalizeCategory(categoria.categoria)} (vence: ${categoria.fechaVencimiento || 'sin fecha'})`)
            .join(', ');

        return reject(LicenseValidationStatus.CATEGORIA_VENCIDA, `La licencia está activa pero las categorías que cumplen con ${required} no están vigentes: ${expiredCategories}`);
    }

    const [selected] = inForceCandidates.sort(compareCandidates);

    return {
        approved: true,
        status: LicenseValidationStatus.APROBADA,
        message: `Licencia ${selected.licencia.numeroLicencia} cumple con la categoría ${required} (aplica ${normalizeCategory(selected.categoria.categoria)})`,
        requiredCategory: required,
        licencia: selected.licencia,
        categoria: selected.categoria
    };
}
