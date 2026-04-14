import React from 'react';

// PreferencesSection: Modular section for reader preferences (font, size, spacing, dyslexia, theme)
// Props: preferences (object), onChange (function)

export interface Preferences {
    font: string;
    fontSize: number;
    lineSpacing: number;
    dyslexiaMode: boolean;
    theme: string;
}

interface PreferencesSectionProps {
    preferences: Preferences;
    onChange: (updated: Partial<Preferences>) => void;
}

const fontOptions = [
    { label: 'Default', value: 'default' },
    { label: 'Serif', value: 'serif' },
    { label: 'Sans-serif', value: 'sans-serif' },
    { label: 'Monospace', value: 'monospace' },
];

const themeOptions = [
    { label: 'Light', value: 'light' },
    { label: 'Dark', value: 'dark' },
    { label: 'Sepia', value: 'sepia' },
];

export const PreferencesSection: React.FC<PreferencesSectionProps> = ({
    preferences,
    onChange,
}) => {
    return (
        <section
            className="settings-section preferences-section"
            aria-labelledby="preferences-heading"
        >
            <h2 id="preferences-heading" className="settings-section-title">
                Reader Preferences
            </h2>
            <div className="settings-row">
                <label htmlFor="font-select">Font</label>
                <select
                    id="font-select"
                    value={preferences.font}
                    onChange={e => onChange({ font: e.target.value })}
                >
                    {fontOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            </div>
            <div className="settings-row">
                <label htmlFor="font-size">Font Size</label>
                <input
                    id="font-size"
                    type="range"
                    min={12}
                    max={32}
                    step={1}
                    value={preferences.fontSize}
                    onChange={e => onChange({ fontSize: Number(e.target.value) })}
                />
                <span>{preferences.fontSize}px</span>
            </div>
            <div className="settings-row">
                <label htmlFor="line-spacing">Line Spacing</label>
                <input
                    id="line-spacing"
                    type="range"
                    min={1}
                    max={3}
                    step={0.1}
                    value={preferences.lineSpacing}
                    onChange={e => onChange({ lineSpacing: Number(e.target.value) })}
                />
                <span>{preferences.lineSpacing}</span>
            </div>
            <div className="settings-row">
                <label htmlFor="dyslexia-mode">Dyslexia Mode</label>
                <input
                    id="dyslexia-mode"
                    type="checkbox"
                    checked={preferences.dyslexiaMode}
                    onChange={e => onChange({ dyslexiaMode: e.target.checked })}
                />
            </div>
            <div className="settings-row">
                <label htmlFor="theme-select">Theme</label>
                <select
                    id="theme-select"
                    value={preferences.theme}
                    onChange={e => onChange({ theme: e.target.value })}
                >
                    {themeOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            </div>
        </section>
    );
};
