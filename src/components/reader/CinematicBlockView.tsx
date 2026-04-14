/**
 * CinematicBlockView.tsx — Animated Block Renderer
 *
 * Renders a single CinematicBlock with type-appropriate animations,
 * tension-driven spacing, and emotion tags.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Volume2 } from 'lucide-react';
import type { CinematicBlock } from '../../types/cinematifier';

export const CinematicBlockView = React.memo(function CinematicBlockView({
    block,
    index,
    immersionLevel,
}: {
    block: CinematicBlock;
    index: number;
    immersionLevel: 'minimal' | 'balanced' | 'cinematic';
}) {
    const isMinimal = immersionLevel === 'minimal';
    const durationMult = immersionLevel === 'cinematic' ? 1.5 : 1;
    const baseDelay = isMinimal ? 0 : Math.min(index * 0.03, 0.5);

    // Different animations based on block type
    const variants = {
        hidden: isMinimal
            ? {
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  filter: 'blur(0px)',
              }
            : {
                  opacity: 0,
                  y: block.type === 'sfx' ? 0 : 30,
                  scale: block.type === 'sfx' ? 0.8 : 1,
                  filter: 'blur(8px)',
              },
        visible: {
            opacity: 1,
            y: 0,
            scale: 1,
            filter: 'blur(0px)',
            transition: isMinimal
                ? { duration: 0 }
                : {
                      duration: (block.type === 'beat' ? 0.8 : 0.6) * durationMult,
                      delay: baseDelay,
                      ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
                  },
        },
    };

    // Tension-driven layout: higher tension = more dramatic spacing
    const tensionClass =
        block.tensionScore !== undefined
            ? block.tensionScore > 80
                ? 'cine-block--tension-extreme'
                : block.tensionScore > 60
                  ? 'cine-block--tension-high'
                  : block.tensionScore > 30
                    ? 'cine-block--tension-medium'
                    : ''
            : '';

    const blockClasses = [
        'cine-block',
        `cine-block--${block.type}`,
        `cine-block--${block.intensity}`,
        block.timing ? `cine-block--timing-${block.timing}` : '',
        tensionClass,
    ]
        .filter(Boolean)
        .join(' ');

    // Render based on block type
    switch (block.type) {
        case 'sfx':
            return (
                <motion.div
                    className={blockClasses}
                    variants={variants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-5% 0px' }}
                    data-index={index}
                    data-emotion={block.emotion || ''}
                    data-tension={block.tensionScore || 0}
                >
                    <div className="cine-sfx">
                        <Volume2 size={16} className="cine-sfx-icon" />
                        <span className="cine-sfx-text">{block.sfx?.sound || block.content}</span>
                    </div>
                </motion.div>
            );

        case 'beat':
            return (
                <motion.div
                    className={blockClasses}
                    variants={variants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-5% 0px' }}
                    data-index={index}
                    data-emotion={block.emotion || ''}
                    data-tension={block.tensionScore || 0}
                >
                    <div className="cine-beat">
                        <span className="cine-beat-dots">• • •</span>
                        <span className="cine-beat-label">{block.beat?.type || 'BEAT'}</span>
                    </div>
                </motion.div>
            );

        case 'transition':
            return (
                <motion.div
                    className={blockClasses}
                    variants={variants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-5% 0px' }}
                    data-index={index}
                    data-emotion={block.emotion || ''}
                    data-tension={block.tensionScore || 0}
                >
                    <div className="cine-transition">
                        <div className="cine-transition-line" />
                        <span className="cine-transition-text">
                            {block.transition?.type || 'CUT TO'}
                            {block.transition?.description && `: ${block.transition.description}`}
                        </span>
                        <div className="cine-transition-line" />
                    </div>
                </motion.div>
            );

        case 'title_card':
            return (
                <motion.div
                    className={blockClasses}
                    variants={variants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-5% 0px' }}
                    data-index={index}
                    data-emotion={block.emotion || ''}
                    data-tension={block.tensionScore || 0}
                >
                    <h2 className="cine-title-card">{block.content}</h2>
                </motion.div>
            );

        case 'dialogue':
            return (
                <motion.div
                    className={blockClasses}
                    variants={variants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-5% 0px' }}
                    data-index={index}
                    data-emotion={block.emotion || ''}
                    data-tension={block.tensionScore || 0}
                >
                    {block.speaker && <div className="cine-speaker">{block.speaker}</div>}
                    <div className="cine-dialogue">
                        <span className="cine-quote">"</span>
                        {block.content}
                        <span className="cine-quote">"</span>
                    </div>
                    {/* Emotion Tag */}
                    {block.emotion && (
                        <div className={`cine-emotion-tag cine-emotion--${block.emotion}`}>
                            {block.emotion}
                        </div>
                    )}
                </motion.div>
            );

        case 'inner_thought':
            return (
                <motion.div
                    className={blockClasses}
                    variants={variants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-5% 0px' }}
                    data-index={index}
                    data-emotion={block.emotion || ''}
                    data-tension={block.tensionScore || 0}
                >
                    <div className="cine-thought">
                        <em>{block.content}</em>
                    </div>
                    {/* Emotion Tag */}
                    {block.emotion && (
                        <div className={`cine-emotion-tag cine-emotion--${block.emotion}`}>
                            {block.emotion}
                        </div>
                    )}
                </motion.div>
            );

        case 'action':
        default: {
            const hasActionText = block.content.trim().length > 0;
            const showTensionMeter = block.tensionScore !== undefined && block.tensionScore > 0;
            const hasActionMetadata = Boolean(block.ambience || block.emotion || showTensionMeter);
            const tensionScore = block.tensionScore ?? 0;

            return (
                <motion.div
                    className={blockClasses}
                    variants={variants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-5% 0px' }}
                    data-index={index}
                    data-emotion={block.emotion || ''}
                    data-tension={block.tensionScore || 0}
                >
                    {block.cameraDirection && (
                        <div className="cine-camera">({block.cameraDirection})</div>
                    )}
                    {hasActionText && <p className="cine-action">{block.content}</p>}

                    {/* Emotion, ambience, and tension metadata */}
                    {hasActionMetadata && (
                        <div className="cine-action-metadata">
                            {block.ambience && (
                                <div className="cine-ambience-tag">{block.ambience}</div>
                            )}
                            {block.emotion && (
                                <div className={`cine-emotion-tag cine-emotion--${block.emotion}`}>
                                    {block.emotion}
                                </div>
                            )}
                            {showTensionMeter && (
                                <div
                                    className="cine-tension-meter"
                                    title={`Tension: ${block.tensionScore}`}
                                >
                                    <div
                                        className="cine-tension-bar cine-tension-bar-dynamic"
                                        style={
                                            {
                                                '--cine-tension-bar-width': `${tensionScore}%`,
                                                '--cine-tension-bar-color': `hsl(${120 - tensionScore * 1.2}, 80%, 50%)`,
                                            } as React.CSSProperties
                                        }
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </motion.div>
            );
        }
    }
});
