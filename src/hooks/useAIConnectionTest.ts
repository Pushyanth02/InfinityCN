import { useCallback } from 'react';
import { getCinematifierAIConfig } from '../store/cinematifierStore';
import { testConnection } from '../lib/ai';
import type { AIConnectionStatus } from '../types/cinematifier';

export function useAIConnectionTest() {
    return useCallback(async (): Promise<AIConnectionStatus> => {
        const config = getCinematifierAIConfig();
        return testConnection(config);
    }, []);
}

