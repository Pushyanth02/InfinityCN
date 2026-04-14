import React from 'react';
import type { CharacterAppearance } from '../../types/cinematifier';
import type { ReaderAnalyticsSummary } from '../../lib/runtime/readerBackend';
import type {
    ReaderBookSuggestion,
    ReaderContentType,
    ReaderSuggestionSource,
    ReaderWordInsight,
} from '../../lib/runtime/readerApis';

type ReaderSuggestionFilter = ReaderContentType | 'all';

const SUGGESTION_FILTERS: Array<{ value: ReaderSuggestionFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'novel', label: 'Novel' },
    { value: 'manga', label: 'Manga' },
    { value: 'manhwa', label: 'Manhwa' },
    { value: 'manhua', label: 'Manhua' },
];

const SOURCE_LABELS: Record<ReaderSuggestionSource, string> = {
    openlibrary: 'Open Library',
    gutendex: 'Gutendex',
    googlebooks: 'Google Books',
    jikan: 'Jikan',
    kitsu: 'Kitsu',
};

interface ReaderCharactersPanelProps {
    characters?: Record<string, CharacterAppearance>;
    insights: ReaderAnalyticsSummary | null;
    wordQuery: string;
    onWordQueryChange: (value: string) => void;
    onLookupWord: (explicitWord?: string) => Promise<void>;
    isWordLookupLoading: boolean;
    wordLookupError: string | null;
    wordInsight: ReaderWordInsight | null;
    bookSuggestions: ReaderBookSuggestion[];
    isSuggestionsLoading: boolean;
    suggestionFilter: ReaderSuggestionFilter;
    onSuggestionFilterChange: (filter: ReaderSuggestionFilter) => void;
}

function formatMinutes(minutes: number): string {
    if (minutes < 60) return `${minutes}m`;

    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (rest === 0) return `${hours}h`;
    return `${hours}h ${rest}m`;
}

function formatContentType(type: ReaderContentType): string {
    switch (type) {
        case 'novel':
            return 'Novel';
        case 'manga':
            return 'Manga';
        case 'manhwa':
            return 'Manhwa';
        case 'manhua':
            return 'Manhua';
    }
}

export const ReaderCharactersPanel: React.FC<ReaderCharactersPanelProps> = ({
    characters,
    insights,
    wordQuery,
    onWordQueryChange,
    onLookupWord,
    isWordLookupLoading,
    wordLookupError,
    wordInsight,
    bookSuggestions,
    isSuggestionsLoading,
    suggestionFilter,
    onSuggestionFilterChange,
}) => {
    const sortedCharacters = Object.entries(characters ?? {})
        .sort(([, a], [, b]) => b.dialogueCount - a.dialogueCount)
        .slice(0, 8);
    const meanings = wordInsight?.meanings.slice(0, 3) ?? [];

    return (
        <aside className="cine-insights-sidebar" aria-label="Character panel">
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
                    <div className="cine-insight-stat-grid">
                        <div className="cine-insight-stat-card">
                            <span className="cine-insight-stat-label">Scenes</span>
                            <strong className="cine-insight-stat-value">
                                {insights.cinematicSceneCount}
                            </strong>
                        </div>
                        <div className="cine-insight-stat-card">
                            <span className="cine-insight-stat-label">Cues</span>
                            <strong className="cine-insight-stat-value">
                                {insights.cinematicCueCount}
                            </strong>
                        </div>
                        <div className="cine-insight-stat-card">
                            <span className="cine-insight-stat-label">Tension</span>
                            <strong className="cine-insight-stat-value">
                                {insights.cinematicAverageTension}
                            </strong>
                        </div>
                        <div className="cine-insight-stat-card">
                            <span className="cine-insight-stat-label">Mood</span>
                            <strong className="cine-insight-stat-value">
                                {insights.cinematicDominantEmotion ?? 'n/a'}
                            </strong>
                        </div>
                    </div>
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
                        void onLookupWord();
                    }}
                >
                    <input
                        className="cine-word-lens-input"
                        value={wordQuery}
                        onChange={event => onWordQueryChange(event.target.value)}
                        placeholder="Lookup a word"
                        aria-label="Lookup a word"
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

                {wordInsight && (
                    <div className="cine-word-lens-result">
                        <p className="cine-word-lens-title">
                            <strong>{wordInsight.word}</strong>
                            {wordInsight.phonetic && <span>{wordInsight.phonetic}</span>}
                        </p>
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
                            </div>
                        ))}
                        {wordInsight.relatedWords.length > 0 && (
                            <div className="cine-word-lens-tags">
                                {wordInsight.relatedWords.slice(0, 8).map(word => (
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
                        )}
                    </div>
                )}
            </section>

            <section className="cine-insight-section">
                <h3 className="cine-insight-section-title">Characters</h3>
                {sortedCharacters.length === 0 ? (
                    <p className="cine-character-empty">No character data yet.</p>
                ) : (
                    <ul className="cine-character-list">
                        {sortedCharacters.map(([name, meta]) => (
                            <li key={name} className="cine-character-item">
                                <span className="cine-character-name">{name}</span>
                                <span className="cine-character-meta">
                                    {meta.dialogueCount} lines · {meta.appearances.length}{' '}
                                    appearances
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="cine-insight-section">
                <h3 className="cine-insight-section-title">Related Titles</h3>
                <div
                    className="cine-content-type-filters"
                    role="group"
                    aria-label="Content type filters"
                >
                    {SUGGESTION_FILTERS.map(filter => (
                        <button
                            key={filter.value}
                            type="button"
                            className={`cine-content-type-chip ${suggestionFilter === filter.value ? 'is-active' : ''}`}
                            onClick={() => onSuggestionFilterChange(filter.value)}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>

                {isSuggestionsLoading ? (
                    <p className="cine-character-empty">Finding related books…</p>
                ) : bookSuggestions.length === 0 ? (
                    <p className="cine-character-empty">No external recommendations yet.</p>
                ) : (
                    <ul className="cine-book-suggestion-list">
                        {bookSuggestions.slice(0, 6).map(suggestion => (
                            <li
                                key={`${suggestion.title}-${suggestion.author ?? 'unknown'}`}
                                className="cine-book-suggestion-item"
                            >
                                <span className="cine-book-suggestion-title">
                                    {suggestion.title}
                                </span>
                                <span className="cine-book-suggestion-meta">
                                    {suggestion.author ?? 'Unknown author'}
                                    {suggestion.year ? ` · ${suggestion.year}` : ''}
                                </span>
                                <span className="cine-book-suggestion-badges">
                                    <span className="cine-book-suggestion-badge">
                                        {formatContentType(suggestion.contentType)}
                                    </span>
                                    <span className="cine-book-suggestion-badge is-source">
                                        {SOURCE_LABELS[suggestion.source]}
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </aside>
    );
};
