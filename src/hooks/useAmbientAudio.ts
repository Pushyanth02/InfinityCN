/**
 * useAmbientAudio — Ambient audio synthesis hook
 *
 * Manages the Web Audio–based ambient soundscape that reacts to
 * emotion tags on visible cinematic blocks. Extracted from CinematicReader.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { AmbientAudioSynth } from '../lib/runtime/audioSynth';
import type { ReaderMode } from '../types/cinematifier';

export function useAmbientAudio(activeEmotion: string, readerMode: ReaderMode) {
    const ambientSynthRef = useRef<AmbientAudioSynth | null>(null);
    const [isAmbientSoundEnabled, setIsAmbientSoundEnabled] = useState(false);

    // Initialize audio synth
    useEffect(() => {
        ambientSynthRef.current = new AmbientAudioSynth();
        return () => ambientSynthRef.current?.destroy();
    }, []);

    // Sync audio theme with scrolling/reading position
    useEffect(() => {
        if (!isAmbientSoundEnabled || readerMode !== 'cinematified') {
            ambientSynthRef.current?.stop();
            return;
        }

        if (activeEmotion) {
            ambientSynthRef.current?.setEmotion(activeEmotion);
        } else {
            ambientSynthRef.current?.setEmotion('neutral');
        }
    }, [activeEmotion, readerMode, isAmbientSoundEnabled]);

    const toggleAmbientSound = useCallback(() => {
        if (!isAmbientSoundEnabled && ambientSynthRef.current) {
            ambientSynthRef.current.play();
        } else if (ambientSynthRef.current) {
            ambientSynthRef.current.stop();
        }
        setIsAmbientSoundEnabled(prev => !prev);
    }, [isAmbientSoundEnabled]);

    return {
        isAmbientSoundEnabled,
        toggleAmbientSound,
    };
}
