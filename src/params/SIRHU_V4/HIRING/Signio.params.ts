export default {

}

export interface HiringRpaRequest {
    id: number;
    database_id: number;
    tenant_id: number;
    process_id: number;
    signio_transaction_id: string;
    origin: string;
    status: string;
    signio_status: string;
    signed_at: Date;
    processed_at: Date | null;
    observations: string | null;
    created_at: Date;
    updated_at: Date;
}