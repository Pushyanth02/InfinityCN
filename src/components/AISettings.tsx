import React, { useState, useEffect } from 'react';
import { X, Sparkles, CheckCircle, XCircle, Loader, Globe, Cpu, Ban, BookOpen, FileText, Theater, Lightbulb, CloudFog, Brain, MessageSquare, Zap, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';
import { testConnection } from '../lib/ai';
import type { AIConnectionStatus } from '../types';

interface AISettingsProps {
    isOpen: boolean;
    onClose: () => void;
}

type Tab = 'engine' | 'features';
type Provider = 'none' | 'chrome' | 'gemini' | 'ollama' | 'openai' | 'anthropic' | 'groq' | 'deepseek';

const PROVIDERS: {
    id: Provider;
    label: string;
    short: string;
    desc: string;
    icon: React.ReactNode;
    color: string;
    glow: string;
}[] = [
        {
            id: 'none', label: 'Offline Only', short: 'Off',
            desc: 'Fast algorithms. No AI. Always available.',
            icon: <Ban size={20} />, color: '#6b7280', glow: 'rgba(107,114,128,0.2)',
        },

        {
            id: 'gemini', label: 'Google Gemini', short: 'Gemini',
            desc: 'Gemini 2.5 Flash via REST API. Best quality.',
            icon: <Globe size={20} />, color: '#f87171', glow: 'rgba(248,113,113,0.2)',
        },
        {
            id: 'openai', label: 'OpenAI (ChatGPT)', short: 'OpenAI',
            desc: 'GPT-4o and other OpenAI models.',
            icon: <Brain size={20} />, color: '#10a37f', glow: 'rgba(16,163,127,0.2)',
        },
        {
            id: 'anthropic', label: 'Anthropic Claude', short: 'Claude',
            desc: 'Claude 3.5 Sonnet and Opus models.',
            icon: <MessageSquare size={20} />, color: '#d97757', glow: 'rgba(217,119,87,0.2)',
        },
        {
            id: 'groq', label: 'Groq Cloud', short: 'Groq',
            desc: 'Ultra-fast LPU inference for open models.',
            icon: <Zap size={20} />, color: '#f55036', glow: 'rgba(245,80,54,0.2)',
        },
        {
            id: 'deepseek', label: 'DeepSeek', short: 'DeepSeek',
            desc: 'High-performance coder and chat models.',
            icon: <Cpu size={20} />, color: '#4d6bfe', glow: 'rgba(77,107,254,0.2)',
        },
        {
            id: 'ollama', label: 'Ollama', short: 'Local',
            desc: 'Run any model locally. Private. No internet needed.',
            icon: <Cpu size={20} />, color: '#fbbf24', glow: 'rgba(251,191,36,0.2)',
        },
    ];

const FEATURES = [
    { icon: <BookOpen size={16} />, label: 'Rich Character Codex', desc: 'Personality, role & narrative arc per character' },
    { icon: <FileText size={16} />, label: 'Cinematic Story Recap', desc: 'Atmospheric 2-3 paragraph chapter summary' },
    { icon: <Theater size={16} />, label: 'Genre & Style Analysis', desc: 'Genre, voice, pacing style & iconic quote' },
    { icon: <Lightbulb size={16} />, label: 'Key Insights', desc: 'Thematic motifs, tone shifts & narrative techniques' },
    { icon: <CloudFog size={16} />, label: 'Mood Enhancement', desc: 'Vivid atmospheric prose atmosphere description' },
];

export const AISettings: React.FC<AISettingsProps> = ({ isOpen, onClose }) => {
    const aiProvider = useStore(s => s.aiProvider);
    const geminiKey = useStore(s => s.geminiKey);
    const ollamaUrl = useStore(s => s.ollamaUrl);
    const ollamaModel = useStore(s => s.ollamaModel);
    const setAiConfig = useStore(s => s.setAiConfig);
    const useSearchGrounding = useStore(s => s.useSearchGrounding);
    const openAiKey = useStore(s => s.openAiKey);
    const anthropicKey = useStore(s => s.anthropicKey);
    const groqKey = useStore(s => s.groqKey);
    const deepseekKey = useStore(s => s.deepseekKey);

    const [tab, setTab] = useState<Tab>('engine');
    const [testStatus, setTest] = useState<AIConnectionStatus | null>(null);
    const [isTesting, setTesting] = useState(false);

    const activeProvider = PROVIDERS.find(p => p.id === aiProvider)!;

    const handleTest = async () => {
        setTesting(true);
        setTest(null);
        const result = await testConnection({
            provider: aiProvider,
            geminiKey,
            useSearchGrounding,
            openAiKey,
            anthropicKey,
            groqKey,
            deepseekKey,
            ollamaUrl,
            ollamaModel
        });
        setTest(result);
        setTesting(false);
    };

    const handleClose = () => { setTest(null); onClose(); };

    // Lock body scroll when panel is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            return () => { document.body.style.overflow = ''; };
        }
    }, [isOpen]);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        className="ai-panel-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={handleClose}
                    />
                    <motion.div
                        className="ai-panel"
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                        role="dialog" aria-modal="true" aria-labelledby="ai-title"
                    >
                        {/* Header */}
                        <div className="ai-modal-header">
                            <div className="ai-modal-title-row">
                                <div className="ai-modal-icon">
                                    <Sparkles size={18} />
                                </div>
                                <div>
                                    <h2 id="ai-title" className="ai-modal-title font-display">AI Intelligence</h2>
                                    <p className="ai-modal-subtitle">
                                        Provider: <span className="active-provider-label" style={{ '--provider-color': activeProvider.color } as React.CSSProperties}>{activeProvider.label}</span>
                                    </p>
                                </div>
                            </div>
                            <button type="button" className="ai-modal-close" onClick={handleClose} aria-label="Close AI settings">
                                <X size={16} />
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="ai-modal-tabs" role="tablist">
                            {(['engine', 'features'] as Tab[]).map(t => (
                                <button
                                    key={t} type="button" role="tab" aria-selected={tab === t}
                                    className={`ai-modal-tab ${tab === t ? 'ai-modal-tab--active' : ''}`}
                                    onClick={() => setTab(t)}
                                >
                                    {t === 'engine' ? '⚡ Engine' : '✦ Features'}
                                </button>
                            ))}
                        </div>

                        <div className="ai-modal-body">
                            {/* ── ENGINE TAB ── */}
                            {tab === 'engine' && (
                                <motion.div key="engine" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                    {/* Provider Cards */}
                                    <div className="ai-provider-grid">
                                        {PROVIDERS.map(p => {
                                            const active = aiProvider === p.id;
                                            return (
                                                <button
                                                    key={p.id}
                                                    type="button"
                                                    className={`ai-provider-card ${active ? 'ai-provider-card--active' : ''}`}
                                                    style={active ? { '--card-color': p.color, '--card-glow': p.glow } as React.CSSProperties : undefined}
                                                    onClick={() => { setTest(null); setAiConfig({ aiProvider: p.id }); }}
                                                    aria-pressed={active}
                                                >
                                                    <div className="ai-provider-card-icon" style={{ color: p.color }}>{p.icon}</div>
                                                    <div className="ai-provider-card-label">{p.label}</div>
                                                    <div className="ai-provider-card-desc">{p.desc}</div>
                                                    {active && <div className="ai-provider-card-dot" />}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {aiProvider === 'gemini' && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                                            <div className="ai-input-group">
                                                <label className="ai-input-label" htmlFor="gemini-key">Gemini API Key</label>
                                                <input
                                                    id="gemini-key" type="password"
                                                    className="ai-input" placeholder="AIzaSy..."
                                                    value={geminiKey}
                                                    onChange={e => setAiConfig({ geminiKey: e.target.value })}
                                                />
                                                <p className="ai-input-hint">Stored in your browser only. Get one at <a href="https://ai.google.dev" target="_blank" rel="noopener noreferrer" className="ai-link">ai.google.dev</a></p>
                                            </div>
                                        </motion.div>
                                    )}

                                    {/* OpenAI */}
                                    {aiProvider === 'openai' && (
                                        <motion.div className="ai-input-group" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                                            <label className="ai-input-label" htmlFor="openai-key">OpenAI API Key</label>
                                            <input
                                                id="openai-key" type="password"
                                                className="ai-input" placeholder="sk-..."
                                                value={openAiKey}
                                                onChange={e => setAiConfig({ openAiKey: e.target.value })}
                                            />
                                            <p className="ai-input-hint">Stored securely in browser. Get one at <a href="https://platform.openai.com" target="_blank" rel="noopener noreferrer" className="ai-link">platform.openai.com</a></p>
                                        </motion.div>
                                    )}

                                    {/* Anthropic */}
                                    {aiProvider === 'anthropic' && (
                                        <motion.div className="ai-input-group" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                                            <label className="ai-input-label" htmlFor="anthropic-key">Anthropic API Key</label>
                                            <input
                                                id="anthropic-key" type="password"
                                                className="ai-input" placeholder="sk-ant-..."
                                                value={anthropicKey}
                                                onChange={e => setAiConfig({ anthropicKey: e.target.value })}
                                            />
                                            <p className="ai-input-hint">Get one at <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="ai-link">console.anthropic.com</a></p>
                                        </motion.div>
                                    )}

                                    {/* Groq */}
                                    {aiProvider === 'groq' && (
                                        <motion.div className="ai-input-group" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                                            <label className="ai-input-label" htmlFor="groq-key">Groq API Key</label>
                                            <input
                                                id="groq-key" type="password"
                                                className="ai-input" placeholder="gsk_..."
                                                value={groqKey}
                                                onChange={e => setAiConfig({ groqKey: e.target.value })}
                                            />
                                            <p className="ai-input-hint">Get one at <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="ai-link">console.groq.com</a></p>
                                        </motion.div>
                                    )}

                                    {/* DeepSeek */}
                                    {aiProvider === 'deepseek' && (
                                        <motion.div className="ai-input-group" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                                            <label className="ai-input-label" htmlFor="deepseek-key">DeepSeek API Key</label>
                                            <input
                                                id="deepseek-key" type="password"
                                                className="ai-input" placeholder="sk-..."
                                                value={deepseekKey}
                                                onChange={e => setAiConfig({ deepseekKey: e.target.value })}
                                            />
                                            <p className="ai-input-hint">Get one at <a href="https://platform.deepseek.com" target="_blank" rel="noopener noreferrer" className="ai-link">platform.deepseek.com</a></p>
                                        </motion.div>
                                    )}

                                    {/* Ollama */}
                                    {aiProvider === 'ollama' && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                                            <div className="ai-input-group">
                                                <label className="ai-input-label" htmlFor="ollama-url">Host URL</label>
                                                <input id="ollama-url" type="url" className="ai-input" placeholder="http://localhost:11434"
                                                    value={ollamaUrl} onChange={e => setAiConfig({ ollamaUrl: e.target.value })} />
                                            </div>
                                            <div className="ai-input-group">
                                                <label className="ai-input-label" htmlFor="ollama-model">
                                                    <Cpu size={12} className="ai-input-label-icon" />
                                                    Model Name
                                                </label>
                                                <input id="ollama-model" type="text" className="ai-input" placeholder="llama3"
                                                    value={ollamaModel} onChange={e => setAiConfig({ ollamaModel: e.target.value })} />
                                                <p className="ai-input-hint">e.g. llama3, mistral, phi3, gemma2</p>
                                            </div>
                                        </motion.div>
                                    )}

                                    {/* Global Search Grounding */}
                                    {aiProvider !== 'none' && aiProvider !== 'chrome' && aiProvider !== 'ollama' && (
                                        <div className="ai-test-section ai-grounding-section">
                                            <div className="ai-input-group ai-grounding-row">
                                                <input
                                                    id="global-grounding" type="checkbox"
                                                    className="ai-checkbox"
                                                    checked={useSearchGrounding}
                                                    onChange={e => setAiConfig({ useSearchGrounding: e.target.checked })}
                                                />
                                                <label className="ai-input-label ai-grounding-label" htmlFor="global-grounding">
                                                    <Search size={14} className="ai-grounding-icon" /> Ground with Web Search
                                                </label>
                                                <p className="ai-input-hint ai-grounding-hint">
                                                    If supported by the API/model, this injects live web search data to improve context.
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                    {/* Test Connection */}
                                    {aiProvider !== 'none' && (
                                        <div className="ai-test-section">
                                            <button
                                                type="button"
                                                className="ai-test-btn"
                                                onClick={handleTest}
                                                disabled={isTesting}
                                                aria-busy={isTesting}
                                            >
                                                {isTesting
                                                    ? <><Loader size={13} className="spin-icon" /> Pinging {activeProvider.label}…</>
                                                    : `Test ${activeProvider.label} Connection`
                                                }
                                            </button>

                                            <AnimatePresence>
                                                {testStatus && (
                                                    <motion.div
                                                        className={`ai-test-result ${testStatus.ok ? 'ai-test-result--ok' : 'ai-test-result--err'}`}
                                                        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                                    >
                                                        <div className="ai-test-result-icon">
                                                            {testStatus.ok ? <CheckCircle size={16} /> : <XCircle size={16} />}
                                                        </div>
                                                        <div className="ai-test-result-body">
                                                            <div className="ai-test-result-msg">{testStatus.message}</div>
                                                            {testStatus.latencyMs != null && (
                                                                <div className="ai-test-result-latency">{testStatus.latencyMs}ms response</div>
                                                            )}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            {/* ── FEATURES TAB ── */}
                            {tab === 'features' && (
                                <motion.div key="features" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                    <p className="ai-features-intro">
                                        All features fall back to offline algorithms automatically when AI is disabled.
                                    </p>
                                    <ul className="ai-features-list">
                                        {FEATURES.map(f => (
                                            <li key={f.label} className="ai-feature-item">
                                                <span className="ai-feature-icon">{f.icon}</span>
                                                <div className="ai-feature-text">
                                                    <div className="ai-feature-label">{f.label}</div>
                                                    <div className="ai-feature-desc">{f.desc}</div>
                                                </div>
                                                <span className={`ai-feature-status ${aiProvider !== 'none' ? 'ai-feature-status--on' : 'ai-feature-status--off'}`}>
                                                    {aiProvider !== 'none' ? '✦ AI' : '⚙ Algo'}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </motion.div>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
