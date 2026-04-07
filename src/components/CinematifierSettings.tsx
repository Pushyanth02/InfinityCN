/**
 * CinematifierSettings.tsx — AI Settings for Cinematifier
 */

import React, { useState, useCallback } from 'react';
import ProviderSection from './ProviderSection';
import { PreferencesSection } from './PreferencesSection';
import type { Preferences } from './PreferencesSection';
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
    Shield,
} from 'lucide-react';
import { useCinematifierStore, getCinematifierAIConfig } from '../store/cinematifierStore';
import { testConnection } from '../lib/ai/index';
import type { AIConnectionStatus } from '../types/cinematifier';
import type { AIProvider } from '../lib/ai/types';

type Provider = AIProvider;

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
        desc: 'Gemini API + custom model IDs',
        icon: <Globe size={18} />,
        color: '#f87171',
    },
    {
        id: 'openai',
        label: 'OpenAI',
        desc: 'OpenAI-compatible model routing',
        icon: <Brain size={18} />,
        color: '#10a37f',
    },
    {
        id: 'anthropic',
        label: 'Claude',
        desc: 'Anthropic models + fallback key map',
        icon: <MessageSquare size={18} />,
        color: '#d97757',
    },
    {
        id: 'groq',
        label: 'Groq',
        desc: 'OpenAI-compatible Groq endpoints',
        icon: <Zap size={18} />,
        color: '#f55036',
    },
    {
        id: 'deepseek',
        label: 'DeepSeek',
        desc: 'DeepSeek chat + custom model IDs',
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

function CinematifierSettings({ onClose }: CinematifierSettingsProps) {
    const aiProvider = useCinematifierStore(s => s.aiProvider);
    const universalApiKey = useCinematifierStore(s => s.universalApiKey);
    const aiModel = useCinematifierStore(s => s.aiModel);
    const geminiKey = useCinematifierStore(s => s.geminiKey);
    const ollamaUrl = useCinematifierStore(s => s.ollamaUrl);
    const ollamaModel = useCinematifierStore(s => s.ollamaModel);
    const openAiKey = useCinematifierStore(s => s.openAiKey);
    const groqKey = useCinematifierStore(s => s.groqKey);
    const deepseekKey = useCinematifierStore(s => s.deepseekKey);
    const anthropicKey = useCinematifierStore(s => s.anthropicKey);
    const useSearchGrounding = useCinematifierStore(s => s.useSearchGrounding);
    const setAiConfig = useCinematifierStore(s => s.setAiConfig);

    // Preferences state
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const font = useCinematifierStore(s => (s as any).font || 'default');
    const fontSize = useCinematifierStore(s => s.fontSize);
    const lineSpacing = useCinematifierStore(s => s.lineSpacing);
    const dyslexiaMode = useCinematifierStore(s => s.dyslexiaFont);
    const theme = useCinematifierStore(s => (s.darkMode ? 'dark' : 'light'));
    const setFontSize = useCinematifierStore(s => s.setFontSize);
    const setLineSpacing = useCinematifierStore(s => s.setLineSpacing);
    const toggleDyslexiaFont = useCinematifierStore(s => s.toggleDyslexiaFont);
    const toggleDarkMode = useCinematifierStore(s => s.toggleDarkMode);

    const [testStatus, setTestStatus] = useState<AIConnectionStatus | null>(null);
    const [isTesting, setIsTesting] = useState(false);

    const selectedProvider = PROVIDERS.find(p => p.id === aiProvider);
    const isProviderConfigured = aiProvider !== 'none' && aiProvider !== 'chrome';

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

    const renderProviderKeyInput = () => {
        switch (aiProvider) {
            case 'gemini':
                return (
                    <div className="cine-input-group">
                        <label htmlFor="gemini-key">Gemini Key (Optional Provider Override)</label>
                        <input
                            id="gemini-key"
                            type="password"
                            value={geminiKey}
                            onChange={e => setAiConfig({ geminiKey: e.target.value })}
                            placeholder="AIza..."
                        />
                        <div className="cine-checkbox-row">
                            <input
                                type="checkbox"
                                id="search-grounding"
                                checked={useSearchGrounding}
                                onChange={e => setAiConfig({ useSearchGrounding: e.target.checked })}
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
                        <label htmlFor="openai-key">OpenAI Key (Optional Provider Override)</label>
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
                        <label htmlFor="anthropic-key">Anthropic Key (Optional Provider Override)</label>
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
                        <label htmlFor="groq-key">Groq Key (Optional Provider Override)</label>
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
                        <label htmlFor="deepseek-key">DeepSeek Key (Optional Provider Override)</label>
                        <input
                            id="deepseek-key"
                            type="password"
                            value={deepseekKey}
                            onChange={e => setAiConfig({ deepseekKey: e.target.value })}
                            placeholder="Enter your DeepSeek API key"
                        />
                    </div>
                );
            default:
                return null;
        }
    };

    const renderKeyInput = () => {
        if (!isProviderConfigured) return null;

        if (aiProvider === 'ollama') {
            return (
                <>
                    <div className="cine-input-group">
                        <label htmlFor="ollama-url">Ollama Server URL</label>
                        <input
                            id="ollama-url"
                            type="text"
                            value={ollamaUrl}
                            onChange={e => setAiConfig({ ollamaUrl: e.target.value })}
                            placeholder="http://localhost:11434"
                        />
                    </div>

                    <div className="cine-input-group">
                        <label htmlFor="ollama-model">Default Local Model</label>
                        <input
                            id="ollama-model"
                            type="text"
                            value={ollamaModel}
                            onChange={e => setAiConfig({ ollamaModel: e.target.value })}
                            placeholder="llama3"
                        />
                    </div>

                    <div className="cine-input-group">
                        <label htmlFor="ai-model">Runtime Model Override (Optional)</label>
                        <input
                            id="ai-model"
                            type="text"
                            value={aiModel}
                            onChange={e => setAiConfig({ aiModel: e.target.value })}
                            placeholder="llama3.1:8b-instruct-q4_K_M"
                        />
                        <p className="cine-field-help">
                            If provided, this model ID is used first for every AI call.
                        </p>
                    </div>
                </>
            );
        }

        return (
            <>
                <div className="cine-input-group">
                    <label htmlFor="universal-key">Universal API Key</label>
                    <input
                        id="universal-key"
                        type="password"
                        value={universalApiKey}
                        onChange={e => setAiConfig({ universalApiKey: e.target.value })}
                        placeholder="Use one key across provider/model selections"
                    />
                    <p className="cine-field-help">
                        Keys are auto-tried across configured providers so a key entered in any slot
                        can still be used.
                    </p>
                </div>

                {renderProviderKeyInput()}

                <div className="cine-input-group">
                    <label htmlFor="ai-model">Model ID Override (Optional)</label>
                    <input
                        id="ai-model"
                        type="text"
                        value={aiModel}
                        onChange={e => setAiConfig({ aiModel: e.target.value })}
                        placeholder={
                            selectedProvider
                                ? `Override ${selectedProvider.label} model`
                                : 'Enter model id'
                        }
                    />
                    <p className="cine-field-help">
                        Leave empty to use the app default model for the selected provider.
                    </p>
                </div>
            </>
        );
    };

    const preferences: Preferences = {
        font,
        fontSize,
        lineSpacing,
        dyslexiaMode,
        theme,
    };

    const handlePreferencesChange = (updated: Partial<Preferences>) => {
        if (updated.fontSize !== undefined) setFontSize(updated.fontSize);
        if (updated.lineSpacing !== undefined) setLineSpacing(updated.lineSpacing);
        if (updated.dyslexiaMode !== undefined) toggleDyslexiaFont();
        if (updated.theme !== undefined) toggleDarkMode();
    };

    return (
        <div className="cine-settings-panel">
            <ProviderSection
                providers={PROVIDERS}
                selectedId={aiProvider}
                onSelect={id => {
                    setTestStatus(null);
                    setAiConfig({ aiProvider: id as Provider });
                }}
            />

            {isProviderConfigured && (
                <div className="cine-settings-notes">
                    <div className="cine-security-note">
                        <Shield size={15} /> API keys are encrypted at rest. Remote AI calls enforce
                        HTTPS endpoints.
                    </div>
                    <div className="cine-flow-note">
                        <Zap size={15} /> Request and token flow limits are automatically applied for
                        stable AI processing.
                    </div>
                </div>
            )}

            {isProviderConfigured && <div className="cine-key-section">{renderKeyInput()}</div>}

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

            <PreferencesSection preferences={preferences} onChange={handlePreferencesChange} />

            {onClose && (
                <div className="cine-settings-footer">
                    <button className="cine-btn" onClick={onClose}>
                        Done
                    </button>
                </div>
            )}
        </div>
    );
}

export default CinematifierSettings;
