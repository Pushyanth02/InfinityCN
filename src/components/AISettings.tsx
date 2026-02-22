import React, { useState, useEffect } from 'react';
import { X, Sparkles, CheckCircle, XCircle, Loader, Globe, Cpu, Zap, Ban, BookOpen, FileText, Theater, Lightbulb, CloudFog } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';
import { testConnection } from '../lib/ai';
import type { AIConnectionStatus } from '../types';

interface AISettingsProps {
    isOpen: boolean;
    onClose: () => void;
}

type Tab = 'engine' | 'features';
type Provider = 'none' | 'chrome' | 'gemini' | 'ollama';

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
            id: 'chrome', label: 'Chrome AI', short: 'Nano',
            desc: 'Built-in Gemini Nano. No API key. Requires Chrome 127+.',
            icon: <Zap size={20} />, color: '#60a5fa', glow: 'rgba(96,165,250,0.2)',
        },
        {
            id: 'gemini', label: 'Google Gemini', short: 'Gemini',
            desc: 'Gemini 2.5 Flash via REST API. Best quality.',
            icon: <Globe size={20} />, color: '#f87171', glow: 'rgba(248,113,113,0.2)',
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

    const [tab, setTab] = useState<Tab>('engine');
    const [testStatus, setTest] = useState<AIConnectionStatus | null>(null);
    const [isTesting, setTesting] = useState(false);

    const activeProvider = PROVIDERS.find(p => p.id === aiProvider)!;

    const handleTest = async () => {
        setTesting(true);
        setTest(null);
        const result = await testConnection({ provider: aiProvider, geminiKey, ollamaUrl, ollamaModel });
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
                                        Provider: <span style={{ color: activeProvider.color }}>{activeProvider.label}</span>
                                    </p>
                                </div>
                            </div>
                            <button className="ai-modal-close" onClick={handleClose} aria-label="Close AI settings">
                                <X size={16} />
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="ai-modal-tabs" role="tablist">
                            {(['engine', 'features'] as Tab[]).map(t => (
                                <button
                                    key={t} role="tab" aria-selected={tab === t}
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

                                    {/* Gemini Key */}
                                    {aiProvider === 'gemini' && (
                                        <motion.div className="ai-input-group" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                                            <label className="ai-input-label" htmlFor="gemini-key">Gemini API Key</label>
                                            <input
                                                id="gemini-key" type="password"
                                                className="ai-input" placeholder="AIzaSy..."
                                                value={geminiKey}
                                                onChange={e => setAiConfig({ geminiKey: e.target.value })}
                                            />
                                            <p className="ai-input-hint">Stored in your browser only. Get one at <a href="https://ai.google.dev" target="_blank" rel="noreferrer" className="ai-link">ai.google.dev</a></p>
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
                                                    <Cpu size={12} style={{ display: 'inline', marginRight: '0.35rem' }} />
                                                    Model Name
                                                </label>
                                                <input id="ollama-model" type="text" className="ai-input" placeholder="llama3"
                                                    value={ollamaModel} onChange={e => setAiConfig({ ollamaModel: e.target.value })} />
                                                <p className="ai-input-hint">e.g. llama3, mistral, phi3, gemma2</p>
                                            </div>
                                        </motion.div>
                                    )}

                                    {/* Test Connection */}
                                    {aiProvider !== 'none' && (
                                        <div className="ai-test-section">
                                            <button
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
