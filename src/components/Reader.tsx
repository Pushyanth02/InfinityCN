import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
    Users,
    Info,
    ChevronRight,
    BookOpen,
    Download,
    Play,
    Square,
    X,
    MessageSquare,
    Lock,
    BarChart3,
} from 'lucide-react';
import { motion } from 'framer-motion';
import type { MangaPanel, Character, Atmosphere, ChapterInsights } from '../types';
import { useStore } from '../store';
import {
    detectNarrativeArc,
    buildCharacterGraph,
    extractDialogueLines,
} from '../lib/narrativeEngine';
import type {
    CharacterGraphResult,
    DialogueLine,
    NarrativeArcResult,
} from '../lib/narrativeEngine';
import type { NamedCharacter } from '../lib/algorithms';

// Module-level store selector (stable ref)
const selectAiProvider = (s: ReturnType<typeof useStore.getState>) => s.aiProvider;

// Narrative arc stage colors (module-level constant)
const STAGE_COLORS: Record<string, string> = {
    exposition: '#60a5fa',
    rising_action: '#fbbf24',
    climax: '#ef4444',
    falling_action: '#a78bfa',
    resolution: '#34d399',
};

interface ReaderProps {
    panels: MangaPanel[];
    characters?: Character[];
    recap?: string | null;
    atmosphere?: Atmosphere | null;
    insights?: ChapterInsights | null;
    chapterTitle?: string | null;
    onClose: () => void;
    onGenerateBonus: () => void;
    isGeneratingBonus?: boolean;
}

// ── CHARACTER GRAPH (SVG FORCE-INSPIRED) ─────────────────────────────────────
const CharacterGraphView = React.memo(function CharacterGraphView({
    graph,
}: {
    graph: CharacterGraphResult;
}) {
    if (graph.nodes.length === 0) return null;
    const w = 240;
    const h = 140;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(cx, cy) - 24;

    const positions = graph.nodes.map((_, i) => {
        const angle = (i / graph.nodes.length) * 2 * Math.PI - Math.PI / 2;
        return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    });

    const nodeById = new Map(graph.nodes.map((n, i) => [n.id, positions[i]]));

    return (
        <svg
            width={w}
            height={h}
            aria-label="Character relationship graph"
            role="img"
            className="char-graph-svg"
        >
            {graph.edges.map(e => {
                const sp = nodeById.get(e.source);
                const tp = nodeById.get(e.target);
                if (!sp || !tp) return null;
                return (
                    <line
                        key={`${e.source}-${e.target}`}
                        x1={sp.x}
                        y1={sp.y}
                        x2={tp.x}
                        y2={tp.y}
                        stroke="var(--accent-crimson)"
                        strokeOpacity={e.weight * 0.6 + 0.1}
                        strokeWidth={Math.max(0.5, e.weight * 2.5)}
                    />
                );
            })}
            {graph.nodes.map((node, i) => {
                const pos = positions[i];
                const nodeR = 4 + node.weight * 7;
                const fill =
                    node.sentiment > 0.1
                        ? '#4ade80'
                        : node.sentiment < -0.1
                          ? '#f87171'
                          : '#94a3b8';
                return (
                    <g key={node.id}>
                        <circle
                            cx={pos.x}
                            cy={pos.y}
                            r={nodeR}
                            fill={fill}
                            fillOpacity={0.25}
                            stroke={fill}
                            strokeWidth="1.5"
                        />
                        <text
                            x={pos.x}
                            y={pos.y + nodeR + 9}
                            textAnchor="middle"
                            className="char-graph-text"
                            fontSize="8"
                        >
                            {node.name.split(' ')[0].slice(0, 8)}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
});

// ── READER PANEL ─────────────────────────────────────────────────────────────
const ReaderPanel = React.memo(function ReaderPanel({
    panel,
    index,
    isActive,
}: {
    panel: MangaPanel;
    index: number;
    isActive: boolean;
}) {
    const intensityClass = panel.intensity ? `intensity-${panel.intensity}` : '';
    const alignClass = panel.alignment ? `align-${panel.alignment}` : '';

    return (
        <motion.article
            className={`panel panel-${panel.type} ${intensityClass} ${alignClass} ${isActive ? 'panel-audio-active' : ''}`}
            initial={{ opacity: 0, y: 60, filter: 'blur(12px)' }}
            whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            viewport={{ once: true, margin: '-10% 0px -10% 0px' }}
            transition={{
                duration: 1.4,
                ease: [0.16, 1, 0.3, 1],
                delay: Math.min(index * 0.02, 0.3),
            }}
        >
            {panel.speaker && (
                <div className="panel-speaker" aria-label={`Speaker: ${panel.speaker}`}>
                    {panel.speaker}
                </div>
            )}
            <div className="panel-content">{panel.content}</div>
            {panel.type === 'sound_effect' && (
                <span className="sfx-text" role="img" aria-label={`Sound effect: ${panel.content}`}>
                    {panel.content}
                </span>
            )}
        </motion.article>
    );
});

// ── EMOTIONAL ARC MINI CHART (SVG) ─────────────────────────────────────────
const EmotionalArcChart = React.memo(function EmotionalArcChart({
    arc,
}: {
    arc: ChapterInsights['emotionalArc'];
}) {
    if (arc.length < 3) return null;
    const w = 220;
    const h = 80;
    const pad = { top: 8, bottom: 16, left: 4, right: 4 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const sentPath = arc
        .map((p, i) => {
            const x = pad.left + (i / (arc.length - 1)) * plotW;
            const y = pad.top + plotH * (1 - (p.sentiment + 1) / 2);
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');

    const tensPath = arc
        .map((p, i) => {
            const x = pad.left + (i / (arc.length - 1)) * plotW;
            const y = pad.top + plotH * (1 - p.tension);
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');

    return (
        <svg
            width={w}
            height={h}
            className="emotional-arc-chart"
            aria-label="Emotional arc"
            role="img"
        >
            <line
                x1={pad.left}
                y1={pad.top + plotH / 2}
                x2={w - pad.right}
                y2={pad.top + plotH / 2}
                stroke="var(--text-muted)"
                strokeOpacity={0.15}
                strokeDasharray="3,3"
            />
            <path
                d={sentPath}
                fill="none"
                stroke="#60a5fa"
                strokeWidth="1.5"
                strokeLinecap="round"
            />
            <path
                d={tensPath}
                fill="none"
                stroke="var(--accent-crimson)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeDasharray="4,2"
            />
            <text x={pad.left} y={h - 2} fontSize="7" fill="var(--text-muted)">
                Start
            </text>
            <text
                x={w - pad.right}
                y={h - 2}
                fontSize="7"
                fill="var(--text-muted)"
                textAnchor="end"
            >
                End
            </text>
            <text
                x={w - pad.right - 2}
                y={pad.top + 10}
                fontSize="7"
                fill="#60a5fa"
                textAnchor="end"
            >
                Sentiment
            </text>
            <text
                x={w - pad.right - 2}
                y={pad.top + 20}
                fontSize="7"
                fill="var(--accent-crimson)"
                textAnchor="end"
            >
                Tension
            </text>
        </svg>
    );
});

// ── INSIGHTS PANEL ──────────────────────────────────────────────────────────
const InsightsPanel = React.memo(function InsightsPanel({
    insights,
}: {
    insights: ChapterInsights;
}) {
    return (
        <div className="insights-panel">
            {/* Readability */}
            <div className="insights-section">
                <div className="analytics-section-label">Readability</div>
                <div className="insights-stat-row">
                    <div className="insights-stat">
                        <span className="insights-stat-value">
                            {insights.readability.fleschKincaid}
                        </span>
                        <span className="insights-stat-label">Grade Level</span>
                    </div>
                    <div className="insights-stat">
                        <span className="insights-stat-value">
                            {insights.readability.readingEase}
                        </span>
                        <span className="insights-stat-label">Reading Ease</span>
                    </div>
                    <div className="insights-stat">
                        <span className="insights-stat-value">{insights.readability.label}</span>
                        <span className="insights-stat-label">Difficulty</span>
                    </div>
                </div>
            </div>

            {/* Vocabulary Richness */}
            <div className="insights-section">
                <div className="analytics-section-label">Vocabulary</div>
                <div className="insights-stat-row">
                    <div className="insights-stat">
                        <span className="insights-stat-value">
                            {(insights.vocabRichness.ttr * 100).toFixed(0)}%
                        </span>
                        <span className="insights-stat-label">Richness</span>
                    </div>
                    <div className="insights-stat">
                        <span className="insights-stat-value">
                            {insights.vocabRichness.uniqueWords.toLocaleString()}
                        </span>
                        <span className="insights-stat-label">Unique Words</span>
                    </div>
                    <div className="insights-stat">
                        <span className="insights-stat-value">{insights.vocabRichness.label}</span>
                        <span className="insights-stat-label">Level</span>
                    </div>
                </div>
            </div>

            {/* Pacing */}
            <div className="insights-section">
                <div className="analytics-section-label">Pacing</div>
                <div className="insights-stat-row">
                    <div className="insights-stat">
                        <span className="insights-stat-value">{insights.pacing.label}</span>
                        <span className="insights-stat-label">Pace</span>
                    </div>
                    <div className="insights-stat">
                        <span className="insights-stat-value">{insights.pacing.sceneCount}</span>
                        <span className="insights-stat-label">Scenes</span>
                    </div>
                    <div className="insights-stat">
                        <span className="insights-stat-value">
                            {(insights.pacing.dialogueRatio * 100).toFixed(0)}%
                        </span>
                        <span className="insights-stat-label">Dialogue</span>
                    </div>
                </div>
                <div className="insights-pacing-bar" aria-label="Sentence composition">
                    <div
                        className="pacing-seg pacing-seg--short"
                        style={{ width: `${insights.pacing.shortSentenceRatio * 100}%` }}
                        title={`Short: ${(insights.pacing.shortSentenceRatio * 100).toFixed(0)}%`}
                    />
                    <div
                        className="pacing-seg pacing-seg--medium"
                        style={{
                            width: `${(1 - insights.pacing.shortSentenceRatio - insights.pacing.longSentenceRatio) * 100}%`,
                        }}
                        title="Medium"
                    />
                    <div
                        className="pacing-seg pacing-seg--long"
                        style={{ width: `${insights.pacing.longSentenceRatio * 100}%` }}
                        title={`Long: ${(insights.pacing.longSentenceRatio * 100).toFixed(0)}%`}
                    />
                </div>
            </div>

            {/* Emotional Arc */}
            {insights.emotionalArc.length > 2 && (
                <div className="insights-section">
                    <div className="analytics-section-label">Emotional Arc</div>
                    <EmotionalArcChart arc={insights.emotionalArc} />
                </div>
            )}

            {/* Keywords */}
            {insights.keywords.length > 0 && (
                <div className="insights-section">
                    <div className="analytics-section-label">Key Terms</div>
                    <div className="insights-keywords">
                        {insights.keywords.map(kw => (
                            <span
                                key={kw.word}
                                className="keyword-pill"
                                style={{ opacity: 0.5 + kw.score * 0.5 }}
                            >
                                {kw.word}
                                <span className="keyword-count">×{kw.count}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Extractive Recap */}
            {insights.extractiveRecap && (
                <div className="insights-section">
                    <div className="analytics-section-label">Auto-Summary</div>
                    <p className="insights-recap">{insights.extractiveRecap}</p>
                </div>
            )}
        </div>
    );
});

// ── READING PROGRESS BAR (isolated from Reader to avoid scroll-triggered re-renders) ──
const ReadingProgressBar = React.memo(function ReadingProgressBar() {
    const barRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleScroll = () => {
            const doc = document.documentElement;
            const total = doc.scrollHeight - doc.clientHeight;
            const pct = total > 0 ? (doc.scrollTop / total) * 100 : 0;
            if (barRef.current) {
                barRef.current.style.setProperty('--progress-width', `${pct}%`);
                barRef.current.setAttribute('aria-valuenow', String(Math.round(pct)));
            }
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <div
            ref={barRef}
            role="progressbar"
            aria-label="Reading progress"
            aria-valuenow={0}
            aria-valuemin={0}
            aria-valuemax={100}
            className="reading-progress-bar"
            style={{ '--progress-width': '0%' } as React.CSSProperties}
        />
    );
});

// ── NARRATIVE STAGE LABEL (isolated — reads scroll position via RAF, not state) ──
const NarrativeStageLabel = React.memo(function NarrativeStageLabel({
    narrativeArc,
}: {
    narrativeArc: NarrativeArcResult;
}) {
    const labelRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        const handleScroll = () => {
            const doc = document.documentElement;
            const total = doc.scrollHeight - doc.clientHeight;
            const pct = total > 0 ? (doc.scrollTop / total) * 100 : 0;
            const stage =
                narrativeArc.stages.find(s => pct >= s.startPercent && pct <= s.endPercent) ||
                narrativeArc.stages[0];
            if (labelRef.current) {
                labelRef.current.textContent = stage.label;
                labelRef.current.style.setProperty(
                    '--stage-color',
                    STAGE_COLORS[stage.stage] ?? '#94a3b8',
                );
            }
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll(); // Set initial value
        return () => window.removeEventListener('scroll', handleScroll);
    }, [narrativeArc]);

    const initial = narrativeArc.stages[0];
    return (
        <span
            ref={labelRef}
            className="reader-nav-stage"
            style={
                {
                    '--stage-color': STAGE_COLORS[initial?.stage] ?? '#94a3b8',
                } as React.CSSProperties
            }
        >
            {initial?.label ?? ''}
        </span>
    );
});

// ══════════════════════════════════════════════════════════════════════════════
// MAIN READER COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
const ReaderComponent: React.FC<ReaderProps> = ({
    panels,
    characters = [],
    recap,
    atmosphere,
    insights,
    chapterTitle,
    onClose,
    onGenerateBonus,
    isGeneratingBonus,
}) => {
    const contentRef = useRef<HTMLDivElement>(null);
    const [showCodex, setShowCodex] = useState(false);
    const [codexTab, setCodexTab] = useState<'characters' | 'dialogue' | 'insights'>('characters');
    const [isExporting, setIsExporting] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [activePanelIndex, setActivePanelIndex] = useState(-1);
    const isPlayingRef = useRef(false);
    const timeoutRef = useRef<number | null>(null);
    const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
    const synthRef = useRef(window.speechSynthesis);

    // Load voices proactively
    useEffect(() => {
        const synth = synthRef.current;
        const loadVoices = () => synth.getVoices();
        loadVoices();
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = loadVoices;
        }
    }, []);

    // ── ADVANCED ANALYTICS (memo — only recalculate when panels/characters change) ──
    const narrativeArc = useMemo(() => detectNarrativeArc(panels), [panels]);
    const charGraph = useMemo(
        () =>
            buildCharacterGraph(
                panels.map(p => p.content).join('\n'),
                characters as unknown as NamedCharacter[],
            ),
        [panels, characters],
    );
    const dialogueLines = useMemo(() => extractDialogueLines(panels), [panels]);

    // ── AUDIO ────────────────────────────────────────────────────────────────
    const stopAudio = useCallback(() => {
        if (utterRef.current) {
            utterRef.current.onend = null; // Prevent onend from triggering next panel
            utterRef.current.onerror = null;
        }
        synthRef.current.cancel();
        isPlayingRef.current = false;
        setIsPlaying(false);
        setActivePanelIndex(-1);
        if (timeoutRef.current) {
            window.clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    const readPanel = useCallback(
        (index: number) => {
            if (index >= panels.length) {
                stopAudio(); // Use the unified stopAudio
                return;
            }

            setActivePanelIndex(index);
            const panel = panels[index];

            if (contentRef.current) {
                const panelEl = contentRef.current.children[index] as HTMLElement;
                if (panelEl) {
                    panelEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }

            // Delay narrating by pacing based on type
            const delayMs =
                panel.type === 'scene_transition'
                    ? 1200
                    : panel.type === 'sound_effect'
                      ? 300
                      : 600;

            timeoutRef.current = window.setTimeout(() => {
                if (!isPlayingRef.current) return;

                const utter = new SpeechSynthesisUtterance(panel.content);
                const voices = synthRef.current.getVoices();
                let voiceAssigned = false;

                if (panel.type === 'dialogue' && panel.speaker && voices.length > 0) {
                    // Simple hash function for character names
                    let hash = 0;
                    for (let i = 0; i < panel.speaker.length; i++) {
                        hash = panel.speaker.charCodeAt(i) + ((hash << 5) - hash);
                    }
                    const voiceIndex = Math.abs(hash) % voices.length;
                    utter.voice = voices[voiceIndex];
                    utter.pitch = 1.0;
                    utter.rate = 1.0;
                    voiceAssigned = true;
                }

                if (!voiceAssigned) {
                    if (panel.type === 'dialogue') {
                        utter.pitch = 1.2;
                        utter.rate = 1.05;
                    } else if (panel.type === 'sound_effect') {
                        utter.pitch = 0.5;
                        utter.rate = 0.8;
                    } else {
                        utter.pitch = 1.0;
                        utter.rate = 0.92;
                    }
                }

                utter.onend = () => {
                    if (isPlayingRef.current) readPanel(index + 1);
                };

                utter.onerror = () => {
                    if (isPlayingRef.current) readPanel(index + 1);
                };

                synthRef.current.speak(utter);
                utterRef.current = utter;
            }, delayMs);
        },
        [panels, stopAudio],
    );

    const playAudio = useCallback(
        (startIndex = 0) => {
            if (synthRef.current.speaking || isPlayingRef.current) return;
            isPlayingRef.current = true;
            setIsPlaying(true);
            readPanel(startIndex);
        },
        [readPanel],
    );

    useEffect(() => {
        return () => {
            stopAudio();
        };
    }, [stopAudio]);

    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [panels]);

    // ── KEYBOARD NAVIGATION ──────────────────────────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowDown' || e.key === 'j') {
                e.preventDefault();
                setActivePanelIndex(prev => {
                    const next = Math.min(prev + 1, panels.length - 1);
                    const el = contentRef.current?.querySelector(
                        `[data-panel-idx="${next}"]`,
                    ) as HTMLElement;
                    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    return next;
                });
            } else if (e.key === 'ArrowUp' || e.key === 'k') {
                e.preventDefault();
                setActivePanelIndex(prev => {
                    const next = Math.max(prev - 1, 0);
                    const el = contentRef.current?.querySelector(
                        `[data-panel-idx="${next}"]`,
                    ) as HTMLElement;
                    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    return next;
                });
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [panels.length]);

    // ── EXPORT ───────────────────────────────────────────────────────────────
    const handleExport = useCallback(async () => {
        if (!contentRef.current) return;
        try {
            setIsExporting(true);
            const { toPng } = await import('html-to-image');
            const dataUrl = await toPng(contentRef.current, { quality: 0.95 });
            const a = document.createElement('a');
            a.download = 'infinitycn-chapter.png';
            a.href = dataUrl;
            a.click();
        } catch (err) {
            console.error('Export failed', err);
        } finally {
            setIsExporting(false);
        }
    }, []);

    const moodClass = atmosphere ? `mood-${atmosphere.mood}` : '';
    const hasCodexData = characters.length > 0 || !!recap || !!insights;
    const activeSidebar = showCodex ? 'codex' : null;
    const aiProvider = useStore(selectAiProvider);
    const hasAI = aiProvider !== 'none';

    return (
        <div className={`reader-root ${moodClass}`} aria-label="Chapter reader">
            {/* Reading Progress Bar (isolated component — no parent re-renders on scroll) */}
            <ReadingProgressBar />

            {atmosphere && <div className="reader-atmosphere-vignette" aria-hidden="true" />}

            {/* ── STICKY NAV ── */}
            <nav className="reader-nav" aria-label="Reader controls">
                <div className="reader-nav-inner">
                    <div className="reader-nav-left">
                        <span className="reader-nav-title font-display">
                            {chapterTitle ||
                                (atmosphere?.mood ? atmosphere.mood.replace(/_/g, ' ') : 'Chapter')}
                        </span>
                        <span className="reader-nav-count">{panels.length} panels</span>
                        {/* Live narrative stage (isolated component — no parent re-renders on scroll) */}
                        <NarrativeStageLabel narrativeArc={narrativeArc} />
                    </div>

                    <div className="reader-nav-actions" role="toolbar" aria-label="Reader actions">
                        {/* Narrate */}
                        <button
                            type="button"
                            className={`reader-btn ${isPlaying ? 'reader-btn--active' : ''}`}
                            onClick={isPlaying ? stopAudio : () => playAudio(0)}
                            aria-label={isPlaying ? 'Stop narration' : 'Narrate chapter'}
                            aria-pressed={isPlaying ? 'true' : 'false'}
                        >
                            {isPlaying ? (
                                <Square size={14} fill="currentColor" />
                            ) : (
                                <Play size={14} fill="currentColor" />
                            )}
                            <span>{isPlaying ? 'Stop' : 'Narrate'}</span>
                        </button>

                        {/* Codex */}
                        {!hasCodexData ? (
                            hasAI ? (
                                <button
                                    type="button"
                                    className="reader-btn reader-btn--accent"
                                    onClick={onGenerateBonus}
                                    disabled={isGeneratingBonus}
                                    aria-busy={isGeneratingBonus ? 'true' : 'false'}
                                >
                                    {isGeneratingBonus ? (
                                        <>
                                            <div className="spinner" aria-hidden="true" />
                                            <span>Generating…</span>
                                        </>
                                    ) : (
                                        <>
                                            <BookOpen size={14} aria-hidden="true" />
                                            <span>Generate</span>
                                        </>
                                    )}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="reader-btn reader-btn--locked"
                                    aria-disabled="true"
                                    title="Enable AI in settings"
                                >
                                    <Lock size={13} aria-hidden="true" />
                                    <span>Generate</span>
                                </button>
                            )
                        ) : (
                            <button
                                type="button"
                                className={`reader-btn ${showCodex ? 'reader-btn--active' : ''}`}
                                onClick={() => {
                                    setShowCodex(v => !v);
                                }}
                                aria-expanded={showCodex ? 'true' : 'false'}
                                aria-controls="codex-sidebar"
                            >
                                <Users size={14} aria-hidden="true" />
                                <span>Codex</span>
                            </button>
                        )}

                        {/* Export */}
                        <button
                            type="button"
                            className="reader-btn"
                            onClick={handleExport}
                            disabled={isExporting}
                            aria-label="Export as image"
                        >
                            {isExporting ? (
                                <>
                                    <div className="spinner" aria-hidden="true" />
                                    <span>Saving…</span>
                                </>
                            ) : (
                                <>
                                    <Download size={14} aria-hidden="true" />
                                    <span>Export</span>
                                </>
                            )}
                        </button>

                        {/* Close */}
                        <button
                            type="button"
                            className="reader-btn"
                            onClick={onClose}
                            aria-label="Close reader"
                        >
                            <X size={14} aria-hidden="true" />
                            <span>Close</span>
                        </button>
                    </div>
                </div>
            </nav>

            {/* ── CONTENT ── */}
            <div className="reader-content-wrapper" ref={contentRef}>
                {/* Story Recap */}
                {recap && (
                    <motion.aside
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.9, delay: 0.3 }}
                        className="reader-recap"
                        aria-label="Story recap"
                    >
                        {atmosphere && (
                            <div className="reader-recap-mood">
                                {atmosphere.mood.replace(/_/g, ' ')}
                            </div>
                        )}
                        <h2 className="reader-recap-heading font-display">The Story So Far</h2>
                        <blockquote className="reader-recap-text">
                            <p>"{recap}"</p>
                        </blockquote>
                    </motion.aside>
                )}

                {/* Panels + Sidebar */}
                <div className={`reader-panels-layout ${activeSidebar ? 'with-codex' : ''}`}>
                    {/* Panel stream */}
                    <div className="reader-panels" role="region" aria-label="Story panels">
                        {panels.map((panel, i) => (
                            <div
                                key={panel.id || `panel-${i}`}
                                id={panel.id}
                                data-panel-idx={i}
                                className={
                                    panel.isSceneBoundary ? 'panel-scene-boundary' : undefined
                                }
                            >
                                <ReaderPanel
                                    panel={panel}
                                    index={i}
                                    isActive={activePanelIndex === i}
                                />
                            </div>
                        ))}
                        <motion.div
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ duration: 1.5 }}
                            className="reader-end-mark"
                            aria-label="End of chapter"
                        >
                            <div className="reader-end-line" aria-hidden="true" />
                            <span>— End of Fragment —</span>
                            <div className="reader-end-line" aria-hidden="true" />
                        </motion.div>
                    </div>

                    {/* ── CHARACTER CODEX SIDEBAR ── */}
                    {showCodex && (
                        <motion.aside
                            id="codex-sidebar"
                            initial={{ opacity: 0, x: 30 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.35 }}
                            className="reader-codex"
                            aria-label="Character codex"
                        >
                            <div className="codex-header">
                                <Info size={16} aria-hidden="true" />
                                <h2 className="font-display">Character Codex</h2>
                                <button
                                    className="codex-close-btn"
                                    onClick={() => setShowCodex(false)}
                                    aria-label="Close codex"
                                >
                                    <X size={14} />
                                </button>
                            </div>

                            <div className="codex-tabs" role="tablist">
                                <button
                                    role="tab"
                                    aria-selected={codexTab === 'characters' ? 'true' : 'false'}
                                    aria-controls="tabpanel-characters"
                                    id="tab-characters"
                                    className={`codex-tab ${codexTab === 'characters' ? 'codex-tab--active' : ''}`}
                                    onClick={() => setCodexTab('characters')}
                                >
                                    <Users size={11} /> Characters
                                </button>
                                <button
                                    role="tab"
                                    aria-selected={codexTab === 'dialogue' ? 'true' : 'false'}
                                    aria-controls="tabpanel-dialogue"
                                    id="tab-dialogue"
                                    className={`codex-tab ${codexTab === 'dialogue' ? 'codex-tab--active' : ''}`}
                                    onClick={() => setCodexTab('dialogue')}
                                >
                                    <MessageSquare size={11} /> Dialogue
                                </button>
                                {insights && (
                                    <button
                                        role="tab"
                                        aria-selected={codexTab === 'insights' ? 'true' : 'false'}
                                        aria-controls="tabpanel-insights"
                                        id="tab-insights"
                                        className={`codex-tab ${codexTab === 'insights' ? 'codex-tab--active' : ''}`}
                                        onClick={() => setCodexTab('insights')}
                                    >
                                        <BarChart3 size={11} /> Insights
                                    </button>
                                )}
                            </div>

                            {codexTab === 'characters' && (
                                <div
                                    id="tabpanel-characters"
                                    role="tabpanel"
                                    aria-labelledby="tab-characters"
                                    className="codex-tabpanel"
                                >
                                    {charGraph.edges.length > 0 && (
                                        <div className="codex-graph-section">
                                            <div className="analytics-section-label">
                                                Relationship Graph
                                            </div>
                                            <CharacterGraphView graph={charGraph} />
                                        </div>
                                    )}
                                    {characters.length > 0 ? (
                                        <ul className="codex-list" role="list">
                                            {characters.map((char, i) => (
                                                <li key={i} className="codex-entry">
                                                    <div className="codex-entry-name">
                                                        <ChevronRight
                                                            size={12}
                                                            aria-hidden="true"
                                                        />
                                                        {char.name}
                                                        {char.honorific && (
                                                            <span className="codex-honorific">
                                                                {char.honorific.toUpperCase()}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {char.frequency && (
                                                        <div className="codex-entry-meta">
                                                            ×{char.frequency} mentions
                                                            {char.sentiment !== undefined && (
                                                                <span
                                                                    className="codex-sentiment"
                                                                    style={
                                                                        {
                                                                            '--sentiment-color':
                                                                                char.sentiment > 0
                                                                                    ? '#4ade80'
                                                                                    : char.sentiment <
                                                                                        0
                                                                                      ? 'var(--accent-crimson)'
                                                                                      : 'var(--text-muted)',
                                                                        } as React.CSSProperties
                                                                    }
                                                                >
                                                                    {char.sentiment > 0.1
                                                                        ? '▲'
                                                                        : char.sentiment < -0.1
                                                                          ? '▼'
                                                                          : '◆'}{' '}
                                                                    affect
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                    <p className="codex-entry-desc">
                                                        {char.description}
                                                    </p>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="codex-empty">
                                            No recurring characters detected. Try a longer chapter.
                                        </p>
                                    )}
                                </div>
                            )}

                            {codexTab === 'dialogue' && (
                                <div
                                    id="tabpanel-dialogue"
                                    role="tabpanel"
                                    aria-labelledby="tab-dialogue"
                                    className="codex-dialogue"
                                >
                                    {dialogueLines.length > 0 ? (
                                        <ul className="dialogue-list" role="list">
                                            {dialogueLines.map((dl: DialogueLine, i) => (
                                                <li key={i} className="dialogue-item">
                                                    <div className="dialogue-speaker">
                                                        {dl.speaker}
                                                    </div>
                                                    <blockquote className="dialogue-line">
                                                        "{dl.line}"
                                                    </blockquote>
                                                    <div
                                                        className="dialogue-tension"
                                                        aria-label={`Tension ${(dl.tension * 100).toFixed(0)}%`}
                                                    >
                                                        <div
                                                            className="dialogue-tension-bar"
                                                            style={
                                                                {
                                                                    '--tension-width': `${dl.tension * 100}%`,
                                                                } as React.CSSProperties
                                                            }
                                                        />
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="codex-empty">
                                            No attributed dialogue detected.
                                        </p>
                                    )}
                                </div>
                            )}

                            {codexTab === 'insights' && insights && (
                                <div
                                    id="tabpanel-insights"
                                    role="tabpanel"
                                    aria-labelledby="tab-insights"
                                    className="codex-tabpanel"
                                >
                                    <InsightsPanel insights={insights} />
                                </div>
                            )}
                        </motion.aside>
                    )}
                </div>
            </div>
        </div>
    );
};

export const Reader = React.memo(ReaderComponent);
Reader.displayName = 'Reader';
