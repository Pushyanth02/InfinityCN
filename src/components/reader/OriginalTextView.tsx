/**
 * OriginalTextView.tsx — Plain Text Renderer
 *
 * Displays the original novel text with paragraph animations.
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

export const OriginalTextView = React.memo(function OriginalTextView({ text }: { text: string }) {
    const paragraphs = useMemo(() => text.split(/\n\s*\n/).filter(p => p.trim()), [text]);

    return (
        <div className="original-text-view">
            {paragraphs.map((para, i) => (
                <motion.p
                    key={`p-${i}-${para.slice(0, 32)}`}
                    className="original-paragraph"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-5% 0px' }}
                    transition={{ duration: 0.5, delay: Math.min(i * 0.02, 0.3) }}
                >
                    {para}
                </motion.p>
            ))}
        </div>
    );
});
