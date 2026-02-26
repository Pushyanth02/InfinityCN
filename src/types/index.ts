export interface Character {
    name: string;
    description: string;
    frequency?: number;
    sentiment?: number;
    honorific?: string;
}

/** AI connection test result */
export interface AIConnectionStatus {
    ok: boolean;
    provider: string;
    message: string;
    latencyMs?: number;
}
