import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Users, Info, ChevronRight, BookOpen, Download, Play, Square, X, BarChart2, MessageSquare, Lock } from 'lucide-react';
import { toPng } from 'html-to-image';
import { motion } from 'framer-motion';
import type { MangaPanel, Character, Atmosphere, ChapterAnalytics } from '../types';
import { useStore } from '../store';
import {
    detectNarrativeArc,
    buildCharacterGraph,
    computeSymbolicDensity,
    extractDialogueLines,
} from '../lib/narrativeEngine';
import type { NarrativeArcResult, CharacterGraphResult, DialogueLine } from '../lib/narrativeEngine';
import type { NamedCharacter } from '../lib/algorithms';

interface ReaderProps {
    panels: MangaPanel[];
    characters?: Character[];
    recap?: string | null;
    atmosphere?: Atmosphere | null;
    analytics?: ChapterAnalytics | null;
    onClose: () => void;
    onGenerateBonus: () => void;
    isGeneratingBonus?: boolean;
    onGenerateIntelligence?: () => void;
    isGeneratingIntelligence?: boolean;
}

// ── EMOTIONAL ARC SVG CHART ──────────────────────────────────────────────────
const EmotionalArc = React.memo(function EmotionalArc({ arc, height = 48 }: { arc: number[]; height?: number }) {
    if (!arc.length) return null;
    const w = 240; const h = height; const mid = h / 2;
    const xStep = w / (arc.length - 1 || 1);
    const pts = arc.map((v, i) => `${i * xStep},${mid - v * (mid * 0.9)}`).join(' ');
    const fill = [`0,${mid}`, ...arc.map((v, i) => `${i * xStep},${mid - v * (mid * 0.9)}`), `${w},${mid}`].join(' ');

    return (
        <svg width={w} height={h} aria-label="Emotional arc" role="img">
            <defs>
                <linearGradient id="arcGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-crimson)" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="var(--accent-crimson)" stopOpacity="0.02" />
                </linearGradient>
            </defs>
            <line x1="0" y1={mid} x2={w} y2={mid} stroke="var(--line-color)" strokeWidth="1" />
            <polygon points={fill} fill="url(#arcGrad)" />
            <polyline points={pts} fill="none" stroke="var(--accent-crimson)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
});

// ── NARRATIVE ARC BAR ────────────────────────────────────────────────────────
const STAGE_COLORS: Record<string, string> = {
    exposition: '#60a5fa',
    rising_action: '#fbbf24',
    climax: '#ef4444',
    falling_action: '#a78bfa',
    resolution: '#34d399',
};

const NarrativeArcBar = React.memo(function NarrativeArcBar({ result }: { result: NarrativeArcResult }) {
    return (
        <div className="narrative-arc-bar" aria-label="Narrative arc structure">
            <div className="narrative-arc-segments">
                {result.stages.map(stage => (
                    <div
                        key={stage.stage}
                        className="narrative-arc-segment"
                        style={{ width: `${stage.endPercent - stage.startPercent}%`, background: STAGE_COLORS[stage.stage] || '#888' }}
                        title={`${stage.label} (avg tension: ${(stage.avgTension * 100).toFixed(0)}%)`}
                        aria-label={stage.label}
                    />
                ))}
            </div>
            <div className="narrative-arc-labels">
                {result.stages.map(stage => (
                    <div
                        key={stage.stage}
                        className="narrative-arc-label"
                        style={{ width: `${stage.endPercent - stage.startPercent}%`, color: STAGE_COLORS[stage.stage] }}
                    >
                        {stage.label}
                    </div>
                ))}
            </div>
            <div className="narrative-arc-meta">
                <span>Climax at {result.climaxPercent.toFixed(0)}%</span>
                <span className="narrative-arc-shape">■ {result.arcShape.replace('_', ' ')}</span>
            </div>
        </div>
    );
});

// ── CHARACTER GRAPH (SVG FORCE-INSPIRED) ─────────────────────────────────────
const CharacterGraphView = React.memo(function CharacterGraphView({ graph }: { graph: CharacterGraphResult }) {
    if (graph.nodes.length === 0) return null;
    const w = 240; const h = 140; const cx = w / 2; const cy = h / 2;
    const r = Math.min(cx, cy) - 24;

    const positions = graph.nodes.map((_, i) => {
        const angle = (i / graph.nodes.length) * 2 * Math.PI - Math.PI / 2;
        return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    });

    const nodeById = new Map(graph.nodes.map((n, i) => [n.id, positions[i]]));

    return (
        <svg width={w} height={h} aria-label="Character relationship graph" role="img" className="char-graph-svg">
            {graph.edges.map(e => {
                const sp = nodeById.get(e.source); const tp = nodeById.get(e.target);
                if (!sp || !tp) return null;
                return (
                    <line key={`${e.source}-${e.target}`}
                        x1={sp.x} y1={sp.y} x2={tp.x} y2={tp.y}
                        stroke="var(--accent-crimson)" strokeOpacity={e.weight * 0.6 + 0.1}
                        strokeWidth={Math.max(0.5, e.weight * 2.5)}
                    />
                );
            })}
            {graph.nodes.map((node, i) => {
                const pos = positions[i];
                const nodeR = 4 + node.weight * 7;
                const fill = node.sentiment > 0.1 ? '#4ade80' : node.sentiment < -0.1 ? '#f87171' : '#94a3b8';
                return (
                    <g key={node.id}>
                        <circle cx={pos.x} cy={pos.y} r={nodeR} fill={fill} fillOpacity={0.25} stroke={fill} strokeWidth="1.5" />
                        <text x={pos.x} y={pos.y + nodeR + 9} textAnchor="middle"
                            fontSize="8" fill="var(--text-muted)" fontFamily="var(--font-mono)">
                            {node.name.split(' ')[0].slice(0, 8)}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
});

// ── STAT BLOCK ───────────────────────────────────────────────────────────────
const Stat = React.memo(function Stat({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
    return (
        <div className="analytics-stat">
            <div className={`analytics-stat-value ${accent ? 'analytics-stat-value--accent' : ''}`}>{value}</div>
            <div className="analytics-stat-label">{label}</div>
            {sub && <div className="analytics-stat-sub">{sub}</div>}
        </div>
    );
});

// ── READER PANEL ─────────────────────────────────────────────────────────────
const ReaderPanel = React.memo(function ReaderPanel({ panel, index }: { panel: MangaPanel; index: number }) {
    const intensityClass = panel.intensity ? `intensity-${panel.intensity}` : '';
    const alignClass = panel.alignment ? `align-${panel.alignment}` : '';

    return (
        <motion.article
            className={`panel panel-${panel.type} ${intensityClass} ${alignClass}`}
            initial={{ opacity: 0, y: 60, filter: 'blur(12px)' }}
            whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            viewport={{ once: true, margin: '-10% 0px -10% 0px' }}
            transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: Math.min(index * 0.02, 0.3) }}
        >
            {panel.speaker && (
                <div className="panel-speaker" aria-label={`Speaker: ${panel.speaker}`}>{panel.speaker}</div>
            )}
            <div className="panel-content">{panel.content}</div>
            {panel.type === 'sound_effect' && (
                <span className="sfx-text" role="img" aria-label={`Sound effect: ${panel.content}`}>{panel.content}</span>
            )}
        </motion.article>
    );
});

// ══════════════════════════════════════════════════════════════════════════════
// MAIN READER COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export const Reader: React.FC<ReaderProps> = ({
    panels,
    characters = [],
    recap,
    atmosphere,
    analytics,
    onClose,
    onGenerateBonus,
    isGeneratingBonus,
    onGenerateIntelligence,
    isGeneratingIntelligence,
}) => {
    const contentRef = useRef<HTMLDivElement>(null);
    const [showCodex, setShowCodex] = useState(false);
    const [showAnalytics, setShowAnalytics] = useState(false);
    const [codexTab, setCodexTab] = useState<'characters' | 'dialogue'>('characters');
    const [isExporting, setIsExporting] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentAudioIndex, setCurrentAudioIndex] = useState(-1);
    const [readingProgress, setReadingProgress] = useState(0);
    const isPlayingRef = useRef(false);
    const synth = window.speechSynthesis;

    // ── ADVANCED ANALYTICS (memo — only recalculate when panels/characters change) ──
    const narrativeArc = useMemo(() => detectNarrativeArc(panels), [panels]);
    const charGraph = useMemo(
        () => buildCharacterGraph(panels.map(p => p.content).join('\n'), characters as unknown as NamedCharacter[]),
        [panels, characters]
    );
    const symbolic = useMemo(() => computeSymbolicDensity(panels.map(p => p.content).join('\n')), [panels]);
    const dialogueLines = useMemo(() => extractDialogueLines(panels), [panels]);

    // ── SCROLL PROGRESS ──────────────────────────────────────────────────────
    useEffect(() => {
        const handleScroll = () => {
            const doc = document.documentElement;
            const total = doc.scrollHeight - doc.clientHeight;
            setReadingProgress(total > 0 ? (doc.scrollTop / total) * 100 : 0);
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // ── AUDIO ────────────────────────────────────────────────────────────────
    const stopAudio = useCallback(() => {
        synth.cancel(); isPlayingRef.current = false;
        setIsPlaying(false); setCurrentAudioIndex(-1);
    }, [synth]);

    const readPanel = useCallback((index: number) => {
        if (index >= panels.length) { stopAudio(); return; }
        const panel = panels[index];
        setCurrentAudioIndex(index);
        document.getElementById(panel.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const utter = new SpeechSynthesisUtterance(panel.content);
        if (panel.type === 'dialogue') { utter.pitch = 1.2; utter.rate = 1.05; }
        else if (panel.type === 'sound_effect') { utter.pitch = 0.5; utter.rate = 0.8; }
        else { utter.pitch = 1.0; utter.rate = 0.92; }
        utter.onend = () => { if (isPlayingRef.current) readPanel(index + 1); };
        utter.onerror = () => stopAudio();
        synth.speak(utter);
    }, [panels, synth, stopAudio]);

    const playAudio = useCallback((startIndex = 0) => {
        if (synth.speaking || isPlayingRef.current) return;
        isPlayingRef.current = true;
        setIsPlaying(true);
        readPanel(startIndex);
    }, [synth, readPanel]);

    useEffect(() => { return () => { synth.cancel(); }; }, []); // eslint-disable-line

    useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [panels]);

    // ── EXPORT ───────────────────────────────────────────────────────────────
    const handleExport = useCallback(async () => {
        if (!contentRef.current) return;
        try {
            setIsExporting(true);
            const dataUrl = await toPng(contentRef.current, { quality: 0.95 });
            const a = document.createElement('a');
            a.download = 'infinitycn-chapter.png'; a.href = dataUrl; a.click();
        } catch (err) { console.error('Export failed', err); }
        finally { setIsExporting(false); }
    }, []);

    const moodClass = atmosphere ? `mood-${atmosphere.mood}` : '';
    const hasCodexData = characters.length > 0 || !!recap;
    const activeSidebar = showCodex ? 'codex' : showAnalytics ? 'analytics' : null;
    const aiProvider = useStore(s => s.aiProvider);
    const hasAI = aiProvider !== 'none';

    return (
        <div className={`reader-root ${moodClass}`} aria-label="Chapter reader">
            {/* Reading Progress Bar */}
            <div
                role="progressbar" aria-label="Reading progress"
                aria-valuenow={Math.round(readingProgress)} aria-valuemin={0} aria-valuemax={100}
                className="reading-progress-bar"
                style={{ width: `${readingProgress}%` }}
            />

            {atmosphere && <div className="reader-atmosphere-vignette" aria-hidden="true" />}

            {/* ── STICKY NAV ── */}
            <nav className="reader-nav" aria-label="Reader controls">
                <div className="reader-nav-inner">
                    <div className="reader-nav-left">
                        <span className="reader-nav-title font-display">
                            {atmosphere?.mood ? atmosphere.mood.replace(/_/g, ' ') : 'Chapter'}
                        </span>
                        <span className="reader-nav-count">{panels.length} panels</span>
                        {analytics && <span className="reader-nav-count">{analytics.estimatedReadingTime} min read</span>}
                        {/* Live narrative stage */}
                        {(() => {
                            const stage = narrativeArc.stages.find(s => readingProgress >= s.startPercent && readingProgress <= s.endPercent) || narrativeArc.stages[0];
                            return (
                                <span className="reader-nav-stage" style={{ color: STAGE_COLORS[stage.stage] }}>
                                    {stage.label}
                                </span>
                            );
                        })()}
                    </div>

                    <div className="reader-nav-actions" role="toolbar" aria-label="Reader actions">
                        {/* Narrate */}
                        <button
                            className={`reader-btn ${isPlaying ? 'reader-btn--active' : ''}`}
                            onClick={isPlaying ? stopAudio : () => playAudio(0)}
                            aria-label={isPlaying ? 'Stop narration' : 'Narrate chapter'}
                        >
                            {isPlaying ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                            <span>{isPlaying ? 'Stop' : 'Narrate'}</span>
                        </button>

                        {/* Analytics */}
                        {analytics && (
                            <button
                                className={`reader-btn ${showAnalytics ? 'reader-btn--active' : ''}`}
                                onClick={() => { setShowAnalytics(v => !v); setShowCodex(false); }}
                                aria-pressed={showAnalytics} aria-label="Toggle analytics"
                            >
                                <BarChart2 size={14} aria-hidden="true" /><span>Analytics</span>
                            </button>
                        )}

                        {/* AI Intelligence */}
                        {onGenerateIntelligence && analytics && (
                            hasAI ? (
                                <button
                                    className="reader-btn reader-btn--gold"
                                    onClick={onGenerateIntelligence}
                                    disabled={isGeneratingIntelligence}
                                    aria-busy={isGeneratingIntelligence}
                                >
                                    {isGeneratingIntelligence
                                        ? <><div className="spinner" aria-hidden="true" /><span>Analysing…</span></>
                                        : <><span aria-hidden="true">✦</span><span>Analyse</span></>}
                                </button>
                            ) : (
                                <button className="reader-btn reader-btn--locked" aria-disabled="true" title="Enable AI in settings">
                                    <Lock size={13} aria-hidden="true" /><span>Analyse</span>
                                </button>
                            )
                        )}

                        {/* Codex */}
                        {!hasCodexData ? (
                            hasAI ? (
                                <button
                                    className="reader-btn reader-btn--accent"
                                    onClick={onGenerateBonus} disabled={isGeneratingBonus} aria-busy={isGeneratingBonus}
                                >
                                    {isGeneratingBonus
                                        ? <><div className="spinner" aria-hidden="true" /><span>Generating…</span></>
                                        : <><BookOpen size={14} aria-hidden="true" /><span>Generate</span></>}
                                </button>
                            ) : (
                                <button className="reader-btn reader-btn--locked" aria-disabled="true" title="Enable AI in settings">
                                    <Lock size={13} aria-hidden="true" /><span>Generate</span>
                                </button>
                            )
                        ) : (
                            <button
                                className={`reader-btn ${showCodex ? 'reader-btn--active' : ''}`}
                                onClick={() => { setShowCodex(v => !v); setShowAnalytics(false); }}
                                aria-pressed={showCodex}
                            >
                                <Users size={14} aria-hidden="true" /><span>Codex</span>
                            </button>
                        )}

                        {/* Export */}
                        <button className="reader-btn" onClick={handleExport} disabled={isExporting} aria-label="Export as image">
                            {isExporting
                                ? <><div className="spinner" aria-hidden="true" /><span>Saving…</span></>
                                : <><Download size={14} aria-hidden="true" /><span>Export</span></>}
                        </button>

                        {/* Close */}
                        <button className="reader-btn" onClick={onClose} aria-label="Close reader">
                            <X size={14} aria-hidden="true" /><span>Close</span>
                        </button>
                    </div>
                </div>
            </nav>

            {/* ── CONTENT ── */}
            <div className="reader-content-wrapper" ref={contentRef}>
                {/* Story Recap */}
                {recap && (
                    <motion.aside
                        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.9, delay: 0.3 }}
                        className="reader-recap" aria-label="Story recap"
                    >
                        {atmosphere && <div className="reader-recap-mood">{atmosphere.mood.replace(/_/g, ' ')}</div>}
                        <h2 className="reader-recap-heading font-display">The Story So Far</h2>
                        <blockquote className="reader-recap-text"><p>"{recap}"</p></blockquote>
                    </motion.aside>
                )}

                {/* Panels + Sidebar */}
                <div className={`reader-panels-layout ${activeSidebar ? 'with-codex' : ''}`}>
                    {/* Panel stream */}
                    <div className="reader-panels" role="region" aria-label="Story panels">
                        {panels.map((panel, index) => (
                            <div
                                key={panel.id || index} id={panel.id}
                                className={[
                                    currentAudioIndex === index ? 'panel-audio-active' : '',
                                    panel.isSceneBoundary ? 'panel-scene-boundary' : '',
                                ].filter(Boolean).join(' ')}
                            >
                                <ReaderPanel panel={panel} index={index} />
                            </div>
                        ))}
                        <motion.div
                            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
                            viewport={{ once: true }} transition={{ duration: 1.5 }}
                            className="reader-end-mark" aria-label="End of chapter"
                        >
                            <div className="reader-end-line" aria-hidden="true" />
                            <span>— End of Fragment —</span>
                            <div className="reader-end-line" aria-hidden="true" />
                        </motion.div>
                    </div>

                    {/* ── CHARACTER CODEX SIDEBAR ── */}
                    {showCodex && (
                        <motion.aside
                            initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.35 }}
                            className="reader-codex" aria-label="Character codex"
                        >
                            <div className="codex-header">
                                <Info size={16} aria-hidden="true" />
                                <h2 className="font-display">Character Codex</h2>
                                <button className="codex-close-btn" onClick={() => setShowCodex(false)} aria-label="Close codex">
                                    <X size={14} />
                                </button>
                            </div>

                            <div className="codex-tabs" role="tablist">
                                <button role="tab" aria-selected={codexTab === 'characters'}
                                    className={`codex-tab ${codexTab === 'characters' ? 'codex-tab--active' : ''}`}
                                    onClick={() => setCodexTab('characters')}>
                                    <Users size={11} /> Characters
                                </button>
                                <button role="tab" aria-selected={codexTab === 'dialogue'}
                                    className={`codex-tab ${codexTab === 'dialogue' ? 'codex-tab--active' : ''}`}
                                    onClick={() => setCodexTab('dialogue')}>
                                    <MessageSquare size={11} /> Dialogue
                                </button>
                            </div>

                            {codexTab === 'characters' && (
                                <>
                                    {charGraph.edges.length > 0 && (
                                        <div className="codex-graph-section">
                                            <div className="analytics-section-label">Relationship Graph</div>
                                            <CharacterGraphView graph={charGraph} />
                                        </div>
                                    )}
                                    {characters.length > 0 ? (
                                        <ul className="codex-list" role="list">
                                            {characters.map((char, i) => (
                                                <li key={i} className="codex-entry">
                                                    <div className="codex-entry-name">
                                                        <ChevronRight size={12} aria-hidden="true" />
                                                        {char.name}
                                                        {char.honorific && <span className="codex-honorific">{char.honorific.toUpperCase()}</span>}
                                                    </div>
                                                    {char.frequency && (
                                                        <div className="codex-entry-meta">
                                                            ×{char.frequency} mentions
                                                            {char.sentiment !== undefined && (
                                                                <span className="codex-sentiment" style={{ color: char.sentiment > 0 ? '#4ade80' : char.sentiment < 0 ? 'var(--accent-crimson)' : 'var(--text-muted)' }}>
                                                                    {char.sentiment > 0.1 ? '▲' : char.sentiment < -0.1 ? '▼' : '◆'} affect
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                    <p className="codex-entry-desc">{char.description}</p>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="codex-empty">No recurring characters detected. Try a longer chapter.</p>
                                    )}
                                </>
                            )}

                            {codexTab === 'dialogue' && (
                                <div className="codex-dialogue">
                                    {dialogueLines.length > 0 ? (
                                        <ul className="dialogue-list" role="list">
                                            {dialogueLines.map((dl: DialogueLine, i) => (
                                                <li key={i} className="dialogue-item">
                                                    <div className="dialogue-speaker">{dl.speaker}</div>
                                                    <blockquote className="dialogue-line">"{dl.line}"</blockquote>
                                                    <div className="dialogue-tension" aria-label={`Tension ${(dl.tension * 100).toFixed(0)}%`}>
                                                        <div className="dialogue-tension-bar" style={{ width: `${dl.tension * 100}%` }} />
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="codex-empty">No attributed dialogue detected.</p>
                                    )}
                                </div>
                            )}
                        </motion.aside>
                    )}

                    {/* ── ANALYTICS SIDEBAR ── */}
                    {showAnalytics && analytics && (
                        <motion.aside
                            initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.35 }}
                            className="reader-codex" aria-label="Text analytics"
                        >
                            <div className="codex-header">
                                <BarChart2 size={16} aria-hidden="true" />
                                <h2 className="font-display">Analytics</h2>
                                <button className="codex-close-btn" onClick={() => setShowAnalytics(false)} aria-label="Close analytics">
                                    <X size={14} />
                                </button>
                            </div>

                            {/* Narrative Arc */}
                            <div className="analytics-section">
                                <div className="analytics-section-label">Narrative Arc</div>
                                <NarrativeArcBar result={narrativeArc} />
                            </div>

                            {/* Emotional Arc */}
                            <div className="analytics-section">
                                <div className="analytics-section-label">Emotional Arc</div>
                                <div className="analytics-arc-wrapper">
                                    <EmotionalArc arc={analytics.emotionalArc} height={48} />
                                </div>
                                <div className="analytics-arc-meta">
                                    <span>Start</span>
                                    <span className={`analytics-tone analytics-tone--${analytics.overallSentiment}`}>{analytics.overallSentiment} tone</span>
                                    <span>End</span>
                                </div>
                            </div>

                            {/* Symbolic Density */}
                            <div className="analytics-section">
                                <div className="analytics-section-label">Literary Richness</div>
                                <div className="analytics-symbolic">
                                    <div className="analytics-symbolic-score">
                                        <div className="analytics-symbolic-fill" style={{ width: `${symbolic.overallScore * 100}%` }} />
                                    </div>
                                    <div className="analytics-stats-grid" style={{ marginTop: '0.5rem' }}>
                                        <Stat label="Similes" value={symbolic.similes} />
                                        <Stat label="Metaphors" value={symbolic.metaphors} />
                                        <Stat label="Style" value={symbolic.label} />
                                    </div>
                                    {symbolic.topMotifs.length > 0 && (
                                        <div className="analytics-motifs">
                                            {symbolic.topMotifs.map((m: string) => <span key={m} className="analytics-motif-chip">{m}</span>)}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Readability */}
                            <div className="analytics-section">
                                <div className="analytics-section-label">Readability</div>
                                <div className="analytics-stats-grid">
                                    <Stat label="Flesch" value={analytics.readability.fleschEase} sub={analytics.readability.label} accent />
                                    <Stat label="Grade" value={`G${analytics.readability.gradeLevel}`} />
                                    <Stat label="Avg Sent" value={`${analytics.readability.avgWordsPerSentence}w`} />
                                    <Stat label="Syl/w" value={analytics.readability.avgSyllablesPerWord} />
                                </div>
                            </div>

                            {/* Vocabulary */}
                            <div className="analytics-section">
                                <div className="analytics-section-label">Vocabulary</div>
                                <div className="analytics-stats-grid">
                                    <Stat label="Words" value={analytics.vocabulary.totalWords.toLocaleString()} />
                                    <Stat label="Unique" value={analytics.vocabulary.uniqueWords.toLocaleString()} />
                                    <Stat label="Richness" value={analytics.vocabulary.richness} accent />
                                    <Stat label="MATTR" value={(analytics.vocabulary.mattr * 100).toFixed(0) + '%'} sub="Lexical density" />
                                </div>
                            </div>

                            {/* Pacing */}
                            <div className="analytics-section">
                                <div className="analytics-section-label">Pacing & Structure</div>
                                <div className="analytics-stats-grid">
                                    <Stat label="Pacing" value={analytics.pacing.label} accent />
                                    <Stat label="Tension" value={(analytics.pacing.avgTension * 100).toFixed(0) + '%'} sub="avg" />
                                    <Stat label="Dialogue" value={(analytics.pacing.dialogueRatio * 100).toFixed(0) + '%'} />
                                    <Stat label="Scenes" value={analytics.sceneBoundaryCount} />
                                </div>
                                <div className="analytics-swings">
                                    {analytics.pacing.emotionalSwings} emotional swing{analytics.pacing.emotionalSwings !== 1 ? 's' : ''} detected
                                </div>
                            </div>

                            {/* Reading Time */}
                            <div className="analytics-section">
                                <div className="analytics-section-label">Reading Time</div>
                                <div className="analytics-time-display">
                                    {analytics.estimatedReadingTime} <span>min</span>
                                </div>
                                <div className="analytics-time-sub">at 200 words per minute</div>
                            </div>
                        </motion.aside>
                    )}
                </div>
            </div>
        </div>
    );
};
