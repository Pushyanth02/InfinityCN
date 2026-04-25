import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { ReaderAnalyticsSummary } from '../../lib/runtime/readerBackend';
import type { ReaderWordInsight } from '../../lib/runtime/readerApis';

import { useReaderDiscovery } from '../../hooks';

interface ReaderCharactersPanelProps {
    insights: ReaderAnalyticsSummary | null;
    isOpen: boolean;
    onClose: () => void;
}

function formatMinutes(minutes: number): string {
    if (minutes < 60) return `${minutes}m`;

    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (rest === 0) return `${hours}h`;
    return `${hours}h ${rest}m`;
}

export const ReaderCharactersPanel: React.FC<ReaderCharactersPanelProps> = ({
    insights,
    isOpen,
    onClose,
}) => {
    const {
        wordQuery,
        setWordQuery,
        lookupWord,
        isWordLookupLoading,
        wordLookupError,
        wordInsight,
        wordSuggestions,
        recentWords,
    } = useReaderDiscovery();
    const meanings = wordInsight?.meanings.slice(0, 4) ?? [];
    const sourceLabel = wordInsight?.sources.join(' + ') ?? null;

    return (
        <aside
            className={`cine-insights-sidebar ${isOpen ? '' : 'is-closed'}`}
            aria-label="Reader insights panel"
        >
            <div className="cine-insights-header">
                <h2 className="cine-insights-title">Insights</h2>
                <button
                    type="button"
                    className="cine-sidebar-close"
                    onClick={onClose}
                    aria-label="Hide insights sidebar"
                    title="Hide insights sidebar"
                >
                    <ChevronRight size={16} />
                </button>
            </div>

            <section className="cine-insight-section">
                <h3 className="cine-insight-section-title">Reading Pace</h3>
                {insights ? (
                    <div className="cine-insight-stat-grid">
                        <div className="cine-insight-stat-card">
                            <span className="cine-insight-stat-label">Progress</span>
                            <strong className="cine-insight-stat-value">
                                {insights.completionPercent}%
                            </strong>
                        </div>
                        <div className="cine-insight-stat-card">
                            <span className="cine-insight-stat-label">Pace</span>
                            <strong className="cine-insight-stat-value">
                                {insights.averageWordsPerMinute} WPM
                            </strong>
                        </div>
                        <div className="cine-insight-stat-card">
                            <span className="cine-insight-stat-label">Today</span>
                            <strong className="cine-insight-stat-value">
                                {formatMinutes(insights.todayReadingMinutes)}
                            </strong>
                        </div>
                        <div className="cine-insight-stat-card">
                            <span className="cine-insight-stat-label">ETA</span>
                            <strong className="cine-insight-stat-value">
                                {formatMinutes(insights.estimatedMinutesRemaining)}
                            </strong>
                        </div>
                    </div>
                ) : (
                    <p className="cine-character-empty">
                        Insights will appear after reading starts.
                    </p>
                )}
            </section>

            <section className="cine-insight-section">
                <h3 className="cine-insight-section-title">Cinematic Depth</h3>
                {insights ? (
                    <>
                        <div className="cine-insight-stat-grid">
                            <div className="cine-insight-stat-card">
                                <span className="cine-insight-stat-label">Depth</span>
                                <strong className="cine-insight-stat-value">
                                    {insights.cinematicDepthScore}/100
                                </strong>
                            </div>
                            <div className="cine-insight-stat-card">
                                <span className="cine-insight-stat-label">Rhythm</span>
                                <strong className="cine-insight-stat-value">
                                    {insights.cinematicRhythm}
                                </strong>
                            </div>
                            <div className="cine-insight-stat-card">
                                <span className="cine-insight-stat-label">Emotions</span>
                                <strong className="cine-insight-stat-value">
                                    {insights.cinematicEmotionRange}
                                </strong>
                            </div>
                            <div className="cine-insight-stat-card">
                                <span className="cine-insight-stat-label">Swing</span>
                                <strong className="cine-insight-stat-value">
                                    {insights.cinematicTensionSwing}
                                </strong>
                            </div>
                        </div>
                        <div className="cine-insight-chip-row">
                            <span className="cine-insight-chip">
                                Scenes {insights.cinematicSceneCount}
                            </span>
                            <span className="cine-insight-chip">Cues {insights.cinematicCueCount}</span>
                            <span className="cine-insight-chip">
                                Dialogue {insights.cinematicDialogueRatio}%
                            </span>
                            <span className="cine-insight-chip">
                                Craft {insights.cinematicSfxCount + insights.cinematicTransitionCount}
                            </span>
                        </div>
                        <div className="cine-insight-chip-row">
                            <span className="cine-insight-chip">
                                Tension {insights.cinematicAverageTension}
                            </span>
                            <span className="cine-insight-chip">
                                Mood {insights.cinematicDominantEmotion ?? 'n/a'}
                            </span>
                        </div>
                    </>
                ) : (
                    <p className="cine-character-empty">
                        Cinematic metrics load after chapter analysis.
                    </p>
                )}
            </section>

            <section className="cine-insight-section">
                <h3 className="cine-insight-section-title">Word Lens</h3>
                <form
                    className="cine-word-lens-form"
                    onSubmit={event => {
                        event.preventDefault();
                        void lookupWord();
                    }}
                >
                    <input
                        className="cine-word-lens-input"
                        value={wordQuery}
                        onChange={event => setWordQuery(event.target.value)}
                        placeholder="Lookup a word"
                        aria-label="Lookup a word"
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <button
                        type="submit"
                        className="cine-word-lens-button"
                        disabled={isWordLookupLoading}
                    >
                        {isWordLookupLoading ? 'Loading…' : 'Lookup'}
                    </button>
                </form>

                {wordLookupError && <p className="cine-word-lens-error">{wordLookupError}</p>}

                {wordSuggestions.length > 0 && (
                    <div className="cine-word-lens-supplement">
                        <p className="cine-word-lens-caption">Suggestions</p>
                        <div className="cine-word-lens-tags">
                            {wordSuggestions.map(word => (
                                <button
                                    key={word}
                                    className="cine-word-tag"
                                    type="button"
                                    onClick={() => {
                                        setWordQuery(word);
                                        void lookupWord(word);
                                    }}
                                >
                                    {word}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {recentWords.length > 0 && (
                    <div className="cine-word-lens-supplement">
                        <p className="cine-word-lens-caption">Recent</p>
                        <div className="cine-word-lens-tags">
                            {recentWords.map(word => (
                                <button
                                    key={word}
                                    className="cine-word-tag"
                                    type="button"
                                    onClick={() => {
                                        setWordQuery(word);
                                        void lookupWord(word);
                                    }}
                                >
                                    {word}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {wordInsight && (
                    <div className="cine-word-lens-result">
                        <p className="cine-word-lens-title">
                            <strong>{wordInsight.word}</strong>
                            {wordInsight.phonetic && <span>{wordInsight.phonetic}</span>}
                        </p>
                        <p className="cine-word-lens-meta">
                            {typeof wordInsight.syllableCount === 'number' &&
                                `${wordInsight.syllableCount} syllables`}
                            {typeof wordInsight.syllableCount === 'number' && sourceLabel && ' · '}
                            {sourceLabel && `sources: ${sourceLabel}`}
                        </p>
                        {wordInsight.examples.length > 0 && (
                            <p className="cine-word-lens-example">
                                “{wordInsight.examples[0]}”
                            </p>
                        )}
                        {meanings.map((meaning, index) => (
                            <div
                                key={`${meaning.definition}-${index}`}
                                className="cine-word-lens-meaning"
                            >
                                {meaning.partOfSpeech && (
                                    <span className="cine-word-lens-pos">
                                        {meaning.partOfSpeech}
                                    </span>
                                )}
                                <p>{meaning.definition}</p>
                                {meaning.example && (
                                    <p className="cine-word-lens-inline-example">
                                        “{meaning.example}”
                                    </p>
                                )}
                            </div>
                        ))}
                        {wordInsight.relatedWords.length > 0 && (
                            <div className="cine-word-lens-supplement">
                                <p className="cine-word-lens-caption">Related Vocabulary</p>
                                <div className="cine-word-lens-tags">
                                    {wordInsight.relatedWords.slice(0, 10).map(word => (
                                        <button
                                            key={word}
                                            className="cine-word-tag"
                                            type="button"
                                            onClick={() => {
                                                onWordQueryChange(word);
                                                void onLookupWord(word);
                                            }}
                                        >
                                            {word}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {wordInsight.antonyms.length > 0 && (
                            <div className="cine-word-lens-supplement">
                                <p className="cine-word-lens-caption">Antonyms</p>
                                <div className="cine-word-lens-tags">
                                    {wordInsight.antonyms.slice(0, 8).map(word => (
                                        <button
                                            key={word}
                                            className="cine-word-tag"
                                            type="button"
                                            onClick={() => {
                                                onWordQueryChange(word);
                                                void onLookupWord(word);
                                            }}
                                        >
                                            {word}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </section>
        </aside>
    );
};
