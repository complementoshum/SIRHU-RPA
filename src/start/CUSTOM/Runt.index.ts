import { runTask } from "../../core/TaskRunner";
import { ConnectionDB, DatabaseType } from "../../database/Connection.db";
import type { RuntCategoria, RuntLicencia } from "../../tasks/ESTUDIO_ANTECEDENTES/Runt.task";

interface RuntAuditPending {
    id: number;
    nit: string | number;
    nombre: string;
    tipo_identificacion: string;
}

function dateKey(value: string): number {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
    return match ? Number(`${match[3]}${match[2]}${match[1]}`) : 0;
}

const CATEGORY_ORDER: readonly string[] = ['A1', 'A2', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3'];

function categoryRank(value: string): number {
    return CATEGORY_ORDER.indexOf(value.replace(/\s+/g, '').toUpperCase());
}

export function selectLicenseCategory(
    licencias: RuntLicencia[],
    today: Date = new Date()
): { licencia: RuntLicencia; categoria: RuntCategoria | null } | null {
    const todayKey = dateKey(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Bogota' }).format(today));
    const candidates = licencias.flatMap(licencia => licencia.categorias.map(categoria => ({ licencia, categoria })))
        .filter(({ categoria }) => categoryRank(categoria.categoria) >= 0);
    const isActive = ({ licencia, categoria }: typeof candidates[number]) =>
        licencia.estado.trim().toUpperCase() === 'ACTIVA' &&
        (!categoria.fechaVencimiento || dateKey(categoria.fechaVencimiento) >= todayKey);
    const active = candidates.filter(isActive);
    const available = active.length ? active : candidates;
    available.sort((a, b) =>
        categoryRank(b.categoria.categoria) - categoryRank(a.categoria.categoria) ||
        dateKey(b.categoria.fechaExpedicion) - dateKey(a.categoria.fechaExpedicion) ||
        dateKey(b.licencia.fechaExpedicion) - dateKey(a.licencia.fechaExpedicion)
    );
    if (available.length) return available[0];

    const latest = [...licencias].sort((a, b) => dateKey(b.fechaExpedicion) - dateKey(a.fechaExpedicion))[0];
    return latest ? { licencia: latest, categoria: null } : null;
}

class RuntValidatorAudit {

    protected connection = new ConnectionDB(DatabaseType.COMPLE);

    public async start() {
        try {
            const persons = await this.getPersonsToValidate();
            for (const person of persons) {

                try {

                    const firtslastName = person.nombre?.trim().split(/\s+/)[0];
                    const documentType = person.tipo_identificacion?.trim();

                    if (!firtslastName || !documentType || !person.nit) throw new Error('Faltan datos para consultar RUNT');

                    await this.connection.query(
                        'UPDATE T_RPA_RUNT_audit SET fecha_ejecucion = COALESCE(fecha_ejecucion, GETDATE()) WHERE id = ? AND fecha_finalizacion IS NULL',
                        [person.id]
                    );

                    const licencias = await runTask<{
                        documentType: string;
                        documentNumber: string;
                        firtslastName: string;
                    }, RuntLicencia[] | null>('ESTUDIO_ANTECEDENTES/Runt', {
                        documentType,
                        documentNumber: String(person.nit).trim(),
                        firtslastName
                    });

                    const selected = licencias ? selectLicenseCategory(licencias) : null;

                    await this.connection.query(
                        `UPDATE T_RPA_RUNT_audit
                         SET categoria_actual = ?, fecha_exp_licencia = CONVERT(date, ?, 103),
                             estado_licencia = ?, fecha_venci_licencia = CONVERT(date, ?, 103),
                             fecha_finalizacion = GETDATE()
                         WHERE id = ? AND fecha_finalizacion IS NULL`,
                        [
                            selected?.categoria?.categoria ?? null,
                            selected?.categoria?.fechaExpedicion || selected?.licencia.fechaExpedicion || null,
                            selected?.licencia.estado.trim() || 'N/A',
                            selected?.categoria?.fechaVencimiento || null,
                            person.id
                        ]
                    );
                    
                } catch (error) {
                    console.error(`Error validando registro RUNT ${person.id}:`, error);
                }
            }
        } finally {
            await this.connection.close();
        }
    }

    private async getPersonsToValidate(): Promise<RuntAuditPending[]> {
        return this.connection.query<RuntAuditPending>(
            `SELECT TOP (10) id, nit, nombre, tipo_identificacion
             FROM T_RPA_RUNT_audit
             WHERE fecha_finalizacion IS NULL
             ORDER BY id ASC`
        );
    }

}

export const start = async () => await (new RuntValidatorAudit).start();

if (require.main === module) {
    start();
}
