/**
 * mangadexConstants.tsx — Shared constants for MangaDex components
 */

import React from 'react';
import { Clock, CheckCircle, PauseCircle, XCircle } from 'lucide-react';

interface StatusConfig {
    icon: (size: number) => React.ReactNode;
    label: string;
    color: string;
}

export const STATUS_CONFIG: Record<string, StatusConfig> = {
    ongoing: { icon: s => <Clock size={s} />, label: 'Ongoing', color: '#22c55e' },
    completed: { icon: s => <CheckCircle size={s} />, label: 'Completed', color: '#3b82f6' },
    hiatus: { icon: s => <PauseCircle size={s} />, label: 'Hiatus', color: '#f59e0b' },
    cancelled: { icon: s => <XCircle size={s} />, label: 'Cancelled', color: '#ef4444' },
};
