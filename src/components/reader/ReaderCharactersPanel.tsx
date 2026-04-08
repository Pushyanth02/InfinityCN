import React from 'react';
import type { CharacterAppearance } from '../../types/cinematifier';

interface ReaderCharactersPanelProps {
    characters?: Record<string, CharacterAppearance>;
}

export const ReaderCharactersPanel: React.FC<ReaderCharactersPanelProps> = ({ characters }) => {
    const sortedCharacters = Object.entries(characters ?? {})
        .sort(([, a], [, b]) => b.dialogueCount - a.dialogueCount)
        .slice(0, 8);

    return (
        <aside className="cine-insights-sidebar" aria-label="Character panel">
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
                                    {meta.dialogueCount} lines · {meta.appearances.length} appearances
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </aside>
    );
};

