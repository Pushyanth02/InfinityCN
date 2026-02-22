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

    const triggerStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        background: 'transparent',
        border: '1px solid var(--line-color)',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        transition: 'all 120ms ease',
    };

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
                style={{
                    ...triggerStyle,
                    color: isOpen ? THEMES[colorTheme].color : triggerStyle.color,
                    border: isOpen ? `1px solid ${THEMES[colorTheme].color}` : triggerStyle.border,
                    boxShadow: isOpen ? `0 0 12px ${THEMES[colorTheme].color}40` : 'none'
                }}
                onClick={() => setIsOpen(!isOpen)}
                title="Theme Studio"
                aria-label="Open Theme Studio"
            >
                <Palette size={16} />
                <div style={{
                    position: 'absolute',
                    right: '0px',
                    bottom: '0px',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: THEMES[colorTheme].color,
                    boxShadow: `0 0 6px ${THEMES[colorTheme].color}`
                }} />
            </button>

            {isOpen && (
                <>
                    <div style={{ ...panelStyle }}>
                        {/* Mode */}
                        <div style={{ marginBottom: '1.25rem' }}>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                                Mode
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    onClick={() => setMode('dark')}
                                    style={{
                                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                                        padding: '0.5rem', background: 'transparent',
                                        border: `1px solid ${mode === 'dark' ? 'var(--accent-crimson)' : 'var(--line-strong)'}`,
                                        color: mode === 'dark' ? 'var(--accent-crimson)' : 'var(--text-secondary)', cursor: 'pointer',
                                        fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
                                        transition: 'all 120ms ease',
                                        borderRadius: '4px'
                                    }}
                                >
                                    <Moon size={11} /> Dark
                                </button>
                                <button
                                    onClick={() => setMode('light')}
                                    style={{
                                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                                        padding: '0.5rem', background: 'transparent',
                                        border: `1px solid ${mode === 'light' ? 'var(--accent-crimson)' : 'var(--line-strong)'}`,
                                        color: mode === 'light' ? 'var(--accent-crimson)' : 'var(--text-secondary)', cursor: 'pointer',
                                        fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
                                        transition: 'all 120ms ease',
                                        borderRadius: '4px'
                                    }}
                                >
                                    <Sun size={11} /> Light
                                </button>
                            </div>
                        </div>

                        {/* Accent */}
                        <div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                                Accent
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                {Object.entries(THEMES).map(([key, config]) => (
                                    <button
                                        key={key}
                                        onClick={() => setColorTheme(key as ColorTheme)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                                            padding: '0.5rem', background: 'transparent', border: 'none', cursor: 'pointer',
                                            fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: colorTheme === key ? 700 : 500, color: colorTheme === key ? 'var(--text-primary)' : 'var(--text-secondary)',
                                            textAlign: 'left', transition: 'color 120ms ease', letterSpacing: '0.05em',
                                        }}
                                    >
                                        <div style={{ width: '10px', height: '10px', background: config.color, flexShrink: 0, boxShadow: colorTheme === key ? `0 0 8px ${config.color}` : 'none' }} />
                                        {config.name}
                                        {colorTheme === key && <Check size={10} style={{ marginLeft: 'auto', color: 'var(--accent-crimson)' }} />}
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
