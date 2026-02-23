import React, { useEffect, useState, useRef } from 'react';
import { Sun, Moon, Check, Palette } from 'lucide-react';

type ColorTheme = 'ember' | 'void' | 'ivory' | 'jade';
type Mode = 'dark' | 'light';

const THEMES: Record<ColorTheme, { name: string; color: string; vars: Record<string, string> }> = {
    ember: {
        name: 'Ember',
        color: '#c62828',
        vars: {
            '--accent-crimson': '#c62828',
            '--accent-crimson-hover': '#e53935',
            '--accent-crimson-glow': 'rgba(198, 40, 40, 0.35)',
            '--accent-gold': '#c9a227',
            '--accent-primary': '#c62828',
            '--accent-primary-hover': '#e53935',
            '--accent-glow': 'rgba(198, 40, 40, 0.35)',
        }
    },
    void: {
        name: 'Void',
        color: '#7c3aed',
        vars: {
            '--accent-crimson': '#7c3aed',
            '--accent-crimson-hover': '#8b5cf6',
            '--accent-crimson-glow': 'rgba(124, 58, 237, 0.35)',
            '--accent-gold': '#a78bfa',
            '--accent-primary': '#7c3aed',
            '--accent-primary-hover': '#8b5cf6',
            '--accent-glow': 'rgba(124, 58, 237, 0.35)',
        }
    },
    ivory: {
        name: 'Ivory',
        color: '#c9a227',
        vars: {
            '--accent-crimson': '#c9a227',
            '--accent-crimson-hover': '#d4af37',
            '--accent-crimson-glow': 'rgba(201, 162, 39, 0.35)',
            '--accent-gold': '#f5e6a3',
            '--accent-primary': '#c9a227',
            '--accent-primary-hover': '#d4af37',
            '--accent-glow': 'rgba(201, 162, 39, 0.35)',
        }
    },
    jade: {
        name: 'Jade',
        color: '#0d9488',
        vars: {
            '--accent-crimson': '#0d9488',
            '--accent-crimson-hover': '#0f9c8e',
            '--accent-crimson-glow': 'rgba(13, 148, 136, 0.35)',
            '--accent-gold': '#5eead4',
            '--accent-primary': '#0d9488',
            '--accent-primary-hover': '#0f9c8e',
            '--accent-glow': 'rgba(13, 148, 136, 0.35)',
        }
    }
};

export const ThemeStudio: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [mode, setMode] = useState<Mode>(
        (localStorage.getItem('infinitycn-theme-mode') as Mode) || 'dark'
    );
    const [colorTheme, setColorTheme] = useState<ColorTheme>(
        (localStorage.getItem('infinitycn-theme-color') as ColorTheme) || 'ember'
    );

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', mode);
        localStorage.setItem('infinitycn-theme-mode', mode);
        const root = document.documentElement;
        Object.entries(THEMES[colorTheme].vars).forEach(([key, value]) => {
            root.style.setProperty(key, value);
        });
        localStorage.setItem('infinitycn-theme-color', colorTheme);
    }, [mode, colorTheme]);

    const panelStyle: React.CSSProperties = {
        position: 'absolute',
        right: 0,
        top: 'calc(100% + 0.5rem)',
        width: '240px',
        background: 'var(--bg-glass)',
        border: '1px solid var(--line-color)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        padding: '1.5rem',
        zIndex: 300,
        boxShadow: 'var(--shadow-lg)',
        borderRadius: '6px',
    };

    const panelRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    return (
        <div style={{ position: 'relative' }} ref={panelRef}>
            <button
                type="button"
                className={`theme-trigger ${isOpen ? 'theme-trigger--open' : ''}`}
                style={{
                    '--trigger-theme-color': THEMES[colorTheme].color
                } as React.CSSProperties}
                onClick={() => setIsOpen(!isOpen)}
                title="Theme Studio"
                aria-label="Open Theme Studio"
                aria-expanded={isOpen}
            >
                <Palette size={16} />
                <div
                    className="theme-trigger-dot"
                    style={{ '--dot-color': THEMES[colorTheme].color } as React.CSSProperties}
                />
            </button>

            {isOpen && (
                <>
                    <div style={{ ...panelStyle }}>
                        {/* Mode */}
                        <div className="theme-panel-section">
                            <div className="theme-section-title">Mode</div>
                            <div className="theme-mode-grid">
                                <button
                                    type="button"
                                    onClick={() => setMode('dark')}
                                    aria-pressed={mode === 'dark'}
                                    className={`theme-mode-btn ${mode === 'dark' ? 'theme-mode-btn--active' : ''}`}
                                >
                                    <Moon size={11} /> Dark
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMode('light')}
                                    aria-pressed={mode === 'light'}
                                    className={`theme-mode-btn ${mode === 'light' ? 'theme-mode-btn--active' : ''}`}
                                >
                                    <Sun size={11} /> Light
                                </button>
                            </div>
                        </div>

                        {/* Accent */}
                        <div className="theme-panel-section">
                            <div className="theme-section-title">Accent</div>
                            <div className="theme-accent-list">
                                {Object.entries(THEMES).map(([key, config]) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setColorTheme(key as ColorTheme)}
                                        aria-pressed={colorTheme === key}
                                        aria-label={`Theme: ${config.name}`}
                                        className={`theme-accent-btn ${colorTheme === key ? 'theme-accent-btn--active' : ''}`}
                                    >
                                        <div
                                            className="theme-accent-dot"
                                            style={{
                                                '--config-color': config.color,
                                                boxShadow: colorTheme === key ? `0 0 8px ${config.color}` : 'none'
                                            } as React.CSSProperties}
                                        />
                                        {config.name}
                                        {colorTheme === key && <Check size={10} className="theme-check-icon" />}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
