/**
 * CinematifierSettings.tsx — AI Settings for Cinematifier
 *
 * Simplified AI provider configuration for the Cinematifier app.
 */

import React, { useState, useCallback } from 'react';
import {
    Globe,
    Cpu,
    Ban,
    Brain,
    MessageSquare,
    Zap,
    CheckCircle,
    XCircle,
    Loader,
    Search,
} from 'lucide-react';
import { useCinematifierStore, getCinematifierAIConfig } from '../store/cinematifierStore';
import { testConnection } from '../lib/ai';
import type { AIConnectionStatus } from '../types/cinematifier';

type Provider =
    | 'none'
    | 'chrome'
    | 'gemini'
    | 'ollama'
    | 'openai'
    | 'anthropic'
    | 'groq'
    | 'deepseek';

const PROVIDERS: {
    id: Provider;
    label: string;
    desc: string;
    icon: React.ReactNode;
    color: string;
}[] = [
    {
        id: 'none',
        label: 'Offline',
        desc: 'Fast algorithms, no AI',
        icon: <Ban size={18} />,
        color: '#6b7280',
    },
    {
        id: 'gemini',
        label: 'Google Gemini',
        desc: 'Gemini 2.5 Flash',
        icon: <Globe size={18} />,
        color: '#f87171',
    },
    {
        id: 'openai',
        label: 'OpenAI',
        desc: 'GPT-4o mini',
        icon: <Brain size={18} />,
        color: '#10a37f',
    },
    {
        id: 'anthropic',
        label: 'Claude',
        desc: 'Claude 3.5 Sonnet',
        icon: <MessageSquare size={18} />,
        color: '#d97757',
    },
    {
        id: 'groq',
        label: 'Groq',
        desc: 'Llama 3.3 70B',
        icon: <Zap size={18} />,
        color: '#f55036',
    },
    {
        id: 'deepseek',
        label: 'DeepSeek',
        desc: 'DeepSeek Chat',
        icon: <Cpu size={18} />,
        color: '#4d6bfe',
    },
    {
        id: 'ollama',
        label: 'Ollama',
        desc: 'Local models',
        icon: <Cpu size={18} />,
        color: '#fbbf24',
    },
];

interface CinematifierSettingsProps {
    onClose?: () => void;
}

export const CinematifierSettings: React.FC<CinematifierSettingsProps> = ({ onClose }) => {
    const aiProvider = useCinematifierStore(s => s.aiProvider);
    const geminiKey = useCinematifierStore(s => s.geminiKey);
    const ollamaUrl = useCinematifierStore(s => s.ollamaUrl);
    const ollamaModel = useCinematifierStore(s => s.ollamaModel);
    const openAiKey = useCinematifierStore(s => s.openAiKey);
    const anthropicKey = useCinematifierStore(s => s.anthropicKey);
    const groqKey = useCinematifierStore(s => s.groqKey);
    const deepseekKey = useCinematifierStore(s => s.deepseekKey);
    const useSearchGrounding = useCinematifierStore(s => s.useSearchGrounding);
    const setAiConfig = useCinematifierStore(s => s.setAiConfig);

    const [testStatus, setTestStatus] = useState<AIConnectionStatus | null>(null);
    const [isTesting, setIsTesting] = useState(false);

    const handleTest = useCallback(async () => {
        setIsTesting(true);
        setTestStatus(null);
        try {
            const config = getCinematifierAIConfig();
            const result = await testConnection(config);
            setTestStatus(result);
        } catch (err) {
            setTestStatus({
                ok: false,
                provider: aiProvider,
                message: err instanceof Error ? err.message : 'Test failed',
            });
        } finally {
            setIsTesting(false);
        }
    }, [aiProvider]);

    const renderKeyInput = () => {
        switch (aiProvider) {
            case 'gemini':
                return (
                    <div className="cine-input-group">
                        <label htmlFor="gemini-key">Gemini API Key</label>
                        <input
                            id="gemini-key"
                            type="password"
                            value={geminiKey}
                            onChange={e => setAiConfig({ geminiKey: e.target.value })}
                            placeholder="Enter your Gemini API key"
                        />
                        <div className="cine-checkbox-row">
                            <input
                                type="checkbox"
                                id="search-grounding"
                                checked={useSearchGrounding}
                                onChange={e =>
                                    setAiConfig({ useSearchGrounding: e.target.checked })
                                }
                            />
                            <label htmlFor="search-grounding">
                                <Search size={14} /> Enable Search Grounding
                            </label>
                        </div>
                    </div>
                );
            case 'openai':
                return (
                    <div className="cine-input-group">
                        <label htmlFor="openai-key">OpenAI API Key</label>
                        <input
                            id="openai-key"
                            type="password"
                            value={openAiKey}
                            onChange={e => setAiConfig({ openAiKey: e.target.value })}
                            placeholder="sk-..."
                        />
                    </div>
                );
            case 'anthropic':
                return (
                    <div className="cine-input-group">
                        <label htmlFor="anthropic-key">Anthropic API Key</label>
                        <input
                            id="anthropic-key"
                            type="password"
                            value={anthropicKey}
                            onChange={e => setAiConfig({ anthropicKey: e.target.value })}
                            placeholder="sk-ant-..."
                        />
                    </div>
                );
            case 'groq':
                return (
                    <div className="cine-input-group">
                        <label htmlFor="groq-key">Groq API Key</label>
                        <input
                            id="groq-key"
                            type="password"
                            value={groqKey}
                            onChange={e => setAiConfig({ groqKey: e.target.value })}
                            placeholder="gsk_..."
                        />
                    </div>
                );
            case 'deepseek':
                return (
                    <div className="cine-input-group">
                        <label htmlFor="deepseek-key">DeepSeek API Key</label>
                        <input
                            id="deepseek-key"
                            type="password"
                            value={deepseekKey}
                            onChange={e => setAiConfig({ deepseekKey: e.target.value })}
                            placeholder="Enter your DeepSeek API key"
                        />
                    </div>
                );
            case 'ollama':
                return (
                    <div className="cine-input-group">
                        <label htmlFor="ollama-url">Ollama Server URL</label>
                        <input
                            id="ollama-url"
                            type="text"
                            value={ollamaUrl}
                            onChange={e => setAiConfig({ ollamaUrl: e.target.value })}
                            placeholder="http://localhost:11434"
                        />
                        <label htmlFor="ollama-model" style={{ marginTop: '0.75rem' }}>
                            Model Name
                        </label>
                        <input
                            id="ollama-model"
                            type="text"
                            value={ollamaModel}
                            onChange={e => setAiConfig({ ollamaModel: e.target.value })}
                            placeholder="llama3"
                        />
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="cine-settings-panel">
            {/* Provider Selection */}
            <div className="cine-provider-grid">
                {PROVIDERS.map(p => (
                    <button
                        key={p.id}
                        type="button"
                        className={`cine-provider-card ${aiProvider === p.id ? 'active' : ''}`}
                        style={{ '--provider-color': p.color } as React.CSSProperties}
                        onClick={() => {
                            setTestStatus(null);
                            setAiConfig({ aiProvider: p.id });
                        }}
                    >
                        <div className="cine-provider-icon" style={{ color: p.color }}>
                            {p.icon}
                        </div>
                        <div className="cine-provider-info">
                            <span className="cine-provider-label">{p.label}</span>
                            <span className="cine-provider-desc">{p.desc}</span>
                        </div>
                    </button>
                ))}
            </div>

            {/* API Key Input */}
            {aiProvider !== 'none' && aiProvider !== 'chrome' && (
                <div className="cine-key-section">{renderKeyInput()}</div>
            )}

            {/* Test Connection */}
            {aiProvider !== 'none' && (
                <div className="cine-test-section">
                    <button
                        className="cine-btn cine-btn--primary"
                        onClick={handleTest}
                        disabled={isTesting}
                    >
                        {isTesting ? (
                            <>
                                <Loader size={16} className="spinning" />
                                Testing...
                            </>
                        ) : (
                            'Test Connection'
                        )}
                    </button>

                    {testStatus && (
                        <div className={`cine-test-result ${testStatus.ok ? 'success' : 'error'}`}>
                            {testStatus.ok ? <CheckCircle size={16} /> : <XCircle size={16} />}
                            <span>{testStatus.message}</span>
                            {testStatus.latencyMs && (
                                <span className="latency">{testStatus.latencyMs}ms</span>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Close Button */}
            {onClose && (
                <div className="cine-settings-footer">
                    <button className="cine-btn" onClick={onClose}>
                        Done
                    </button>
                </div>
            )}

            <style>{`
                .cine-settings-panel {
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                }
                
                .cine-provider-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
                    gap: 0.75rem;
                }
                
                .cine-provider-card {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 0.75rem;
                    background: var(--cine-bg-tertiary);
                    border: 2px solid transparent;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 150ms ease;
                    text-align: left;
                }
                
                .cine-provider-card:hover {
                    background: var(--cine-bg-elevated);
                }
                
                .cine-provider-card.active {
                    border-color: var(--provider-color);
                    background: color-mix(in srgb, var(--provider-color) 10%, var(--cine-bg-tertiary));
                }
                
                .cine-provider-icon {
                    flex-shrink: 0;
                }
                
                .cine-provider-info {
                    display: flex;
                    flex-direction: column;
                    gap: 0.125rem;
                    min-width: 0;
                }
                
                .cine-provider-label {
                    font-size: 0.875rem;
                    font-weight: 600;
                    color: var(--cine-text-primary);
                }
                
                .cine-provider-desc {
                    font-size: 0.75rem;
                    color: var(--cine-text-muted);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                
                .cine-key-section {
                    padding: 1rem;
                    background: var(--cine-bg-tertiary);
                    border-radius: 8px;
                }
                
                .cine-input-group {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                
                .cine-input-group label {
                    font-size: 0.75rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--cine-text-muted);
                }
                
                .cine-input-group input[type="text"],
                .cine-input-group input[type="password"] {
                    padding: 0.75rem;
                    background: var(--cine-bg-secondary);
                    border: 1px solid var(--cine-bg-elevated);
                    border-radius: 6px;
                    color: var(--cine-text-primary);
                    font-size: 0.875rem;
                }
                
                .cine-input-group input:focus {
                    outline: none;
                    border-color: var(--cine-red);
                }
                
                .cine-checkbox-row {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    margin-top: 0.75rem;
                }
                
                .cine-checkbox-row label {
                    display: flex;
                    align-items: center;
                    gap: 0.25rem;
                    font-size: 0.875rem;
                    color: var(--cine-text-secondary);
                    text-transform: none;
                    letter-spacing: normal;
                }
                
                .cine-checkbox-row input[type="checkbox"] {
                    width: 16px;
                    height: 16px;
                    accent-color: var(--cine-red);
                }
                
                .cine-test-section {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                    align-items: flex-start;
                }
                
                .cine-test-result {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.5rem 0.75rem;
                    border-radius: 6px;
                    font-size: 0.875rem;
                }
                
                .cine-test-result.success {
                    background: rgba(34, 197, 94, 0.1);
                    color: #22c55e;
                }
                
                .cine-test-result.error {
                    background: rgba(239, 68, 68, 0.1);
                    color: #ef4444;
                }
                
                .cine-test-result .latency {
                    margin-left: auto;
                    opacity: 0.7;
                }
                
                .cine-settings-footer {
                    display: flex;
                    justify-content: flex-end;
                    padding-top: 1rem;
                    border-top: 1px solid var(--cine-bg-tertiary);
                }
                
                .spinning {
                    animation: spin 1s linear infinite;
                }
                
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

export default CinematifierSettings;
