/**
 * Ambient Audio Synthesizer
 * Generates procedural soundscapes using the Web Audio API without external file dependencies.
 *
 * Features:
 *   - Emotion-based soundscape selection (wind, rain, rumble, ethereal, ocean, heartbeat, forest)
 *   - Tension-driven audio morphing: continuous filter/gain modulation from tension score 0–100
 *   - Crossfading between emotion changes
 *   - Lazy AudioContext initialization for auto-play compliance
 */

export class AmbientAudioSynth {
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private currentSources: AudioNode[] = [];
    private activeEmotion: string = '';
    private isPlaying: boolean = false;
    private crossfadeTimeout: ReturnType<typeof setTimeout> | null = null;
    /** Timer for fade-out before stopping sources */
    private stopTimeout: ReturnType<typeof setTimeout> | null = null;
    /** Timer for deferred destroy */
    private destroyTimeout: ReturnType<typeof setTimeout> | null = null;
    /** Current tension level (0–100) used for real-time audio morphing */
    private tensionLevel: number = 0;
    /** Active filter node for tension modulation */
    private tensionFilter: BiquadFilterNode | null = null;
    /** Active gain node for tension modulation */
    private tensionGain: GainNode | null = null;

    constructor() {
        // Initialize lazily to respect auto-play policies
    }

    private initContext() {
        if (!this.ctx) {
            this.ctx = new (
                window.AudioContext ||
                (window as unknown as { webkitAudioContext: typeof AudioContext })
                    .webkitAudioContext
            )();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0; // Start muted for fade-in
            this.masterGain.connect(this.ctx.destination);
        }
    }

    /**
     * Set the current emotion, crossfading into the appropriate soundscape.
     */
    public setEmotion(emotion: string) {
        if (!this.isPlaying) return;
        if (this.activeEmotion === emotion) return;

        this.initContext();
        if (!this.ctx || !this.masterGain) return;

        this.activeEmotion = emotion;

        // Cancel any pending crossfade from a previous setEmotion call
        if (this.crossfadeTimeout) {
            clearTimeout(this.crossfadeTimeout);
            this.crossfadeTimeout = null;
        }

        // Fade out current sounds
        this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);

        this.crossfadeTimeout = setTimeout(() => {
            this.crossfadeTimeout = null;
            this.stopCurrentSources();
            this.playEmotionSoundscape(emotion);
            // Fade back in
            if (this.masterGain && this.ctx) {
                this.masterGain.gain.setTargetAtTime(0.5, this.ctx.currentTime, 1.0);
            }
        }, 1000); // Wait for fade out
    }

    public play() {
        this.initContext();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        this.isPlaying = true;

        if (this.currentSources.length === 0) {
            this.playEmotionSoundscape(this.activeEmotion || 'neutral');
            if (this.masterGain && this.ctx) {
                this.masterGain.gain.setTargetAtTime(0.5, this.ctx.currentTime, 1.0);
            }
        }
    }

    public stop() {
        this.isPlaying = false;
        if (this.crossfadeTimeout) {
            clearTimeout(this.crossfadeTimeout);
            this.crossfadeTimeout = null;
        }
        if (this.stopTimeout) {
            clearTimeout(this.stopTimeout);
            this.stopTimeout = null;
        }
        if (this.masterGain && this.ctx) {
            this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
            this.stopTimeout = setTimeout(() => {
                this.stopTimeout = null;
                this.stopCurrentSources();
            }, 500);
        }
    }

    /** Fully release the AudioContext and all resources. Call on component unmount. */
    public destroy() {
        if (this.isPlaying) this.stop();
        if (this.destroyTimeout) {
            clearTimeout(this.destroyTimeout);
            this.destroyTimeout = null;
        }
        // Allow fade-out to finish before closing
        this.destroyTimeout = setTimeout(() => {
            this.destroyTimeout = null;
            if (this.stopTimeout) {
                clearTimeout(this.stopTimeout);
                this.stopTimeout = null;
            }
            this.stopCurrentSources();
            if (this.ctx && this.ctx.state !== 'closed') {
                this.ctx.close().catch(e => {
                    console.warn('[AmbientAudioSynth] Failed to close AudioContext:', e);
                });
            }
            this.ctx = null;
            this.masterGain = null;
        }, 600);
    }

    private stopCurrentSources() {
        this.currentSources.forEach(source => {
            if (source instanceof AudioBufferSourceNode || source instanceof OscillatorNode) {
                try {
                    source.stop();
                } catch {
                    // Ignore already stopped nodes
                }
            }
            source.disconnect();
        });
        this.currentSources = [];
        this.tensionFilter = null;
        this.tensionGain = null;
    }

    /**
     * Set the current tension level (0–100) for real-time audio morphing.
     * Higher tension = lower filter frequency + louder bass + faster LFO modulation.
     * This creates an oppressive, claustrophobic soundscape during tense moments.
     */
    public setTension(tension: number) {
        this.tensionLevel = Math.max(0, Math.min(100, tension));
        if (!this.isPlaying || !this.ctx) return;

        const t = this.tensionLevel / 100; // 0–1

        // Morph filter: high tension → lower cutoff (darker sound)
        if (this.tensionFilter) {
            const baseFreq = 800;
            const targetFreq = baseFreq - t * 600; // 800Hz → 200Hz
            this.tensionFilter.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.3);
            // Increase resonance at high tension for more dramatic effect
            this.tensionFilter.Q.setTargetAtTime(0.5 + t * 4, this.ctx.currentTime, 0.3);
        }

        // Morph gain: high tension → slightly louder for impact
        if (this.tensionGain) {
            const gain = 1.0 + t * 0.5; // 1.0 → 1.5
            this.tensionGain.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.3);
        }
    }

    // --- Soundscape Generators ---

    private playEmotionSoundscape(emotion: string) {
        if (!this.ctx || !this.masterGain) return;

        // Create tension processing chain (shared by all soundscapes)
        this.tensionFilter = this.ctx.createBiquadFilter();
        this.tensionFilter.type = 'lowpass';
        this.tensionFilter.frequency.value = 800;
        this.tensionFilter.Q.value = 0.5;

        this.tensionGain = this.ctx.createGain();
        this.tensionGain.gain.value = 1.0;

        this.tensionFilter.connect(this.tensionGain);
        this.tensionGain.connect(this.masterGain);
        this.currentSources.push(this.tensionFilter, this.tensionGain);

        switch (emotion.toLowerCase()) {
            case 'fear':
                this.generateHeartbeat();
                break;
            case 'sadness':
                this.generateRainAndThunder();
                break;
            case 'anger':
                this.generateDeepRumble();
                break;
            case 'suspense':
                this.generateOceanWaves();
                break;
            case 'joy':
                this.generateForestAmbience();
                break;
            case 'surprise':
                this.generateEtherealHum();
                break;
            default:
                this.generateWind();
                break;
        }

        // Apply current tension after soundscape is set up
        this.setTension(this.tensionLevel);
    }

    private createNoiseBuffer(): AudioBuffer | null {
        if (!this.ctx) return null;
        const bufferSize = this.ctx.sampleRate * 2; // 2 seconds of noise
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buffer;
    }

    /** Get the output node — route through tension filter if available */
    private getOutputNode(): AudioNode {
        return this.tensionFilter ?? this.masterGain!;
    }

    private generateWind() {
        if (!this.ctx || !this.masterGain) return;

        const noiseBuffer = this.createNoiseBuffer();
        if (!noiseBuffer) return;

        const noise = this.ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = true;

        const lowpass = this.ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 400; // Muffled wind
        lowpass.Q.value = 0.5;

        // Modulate the wind filter frequency to simulate gusts
        const lfo = this.ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.2; // 0.2 Hz slow sweeping

        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 200; // Sweep range

        lfo.connect(lfoGain);
        lfoGain.connect(lowpass.frequency);

        noise.connect(lowpass);
        lowpass.connect(this.getOutputNode());

        noise.start();
        lfo.start();

        this.currentSources.push(noise, lowpass, lfo, lfoGain);
    }

    private generateRainAndThunder() {
        if (!this.ctx || !this.masterGain) return;

        const noiseBuffer = this.createNoiseBuffer();
        if (!noiseBuffer) return;

        const noise = this.ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = true;

        const bandpass = this.ctx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.value = 1000;
        bandpass.Q.value = 1.0;

        noise.connect(bandpass);
        bandpass.connect(this.getOutputNode());

        noise.start();
        this.currentSources.push(noise, bandpass);
    }

    private generateDeepRumble() {
        if (!this.ctx || !this.masterGain) return;

        const noiseBuffer = this.createNoiseBuffer();
        if (!noiseBuffer) return;

        const noise = this.ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = true;

        const lowpass = this.ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 150; // Very deep
        lowpass.Q.value = 5.0; // Resonant

        const localGain = this.ctx.createGain();
        localGain.gain.value = 3.0; // Boost rumble

        noise.connect(lowpass);
        lowpass.connect(localGain);
        localGain.connect(this.getOutputNode());

        noise.start();
        this.currentSources.push(noise, lowpass, localGain);
    }

    private generateEtherealHum() {
        if (!this.ctx || !this.masterGain) return;

        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();

        osc1.type = 'sine';
        osc1.frequency.value = 220; // A3

        osc2.type = 'triangle';
        osc2.frequency.value = 222; // Slight detune for beating

        const localGain = this.ctx.createGain();
        localGain.gain.value = 0.1; // Very quiet

        osc1.connect(localGain);
        osc2.connect(localGain);
        localGain.connect(this.getOutputNode());

        osc1.start();
        osc2.start();

        this.currentSources.push(osc1, osc2, localGain);
    }

    // --- New Soundscapes ---

    private generateOceanWaves() {
        if (!this.ctx || !this.masterGain) return;

        const noiseBuffer = this.createNoiseBuffer();
        if (!noiseBuffer) return;

        const noise = this.ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = true;

        // Shape noise into ocean-like rolling waves
        const lowpass = this.ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 600;
        lowpass.Q.value = 0.3;

        // Slow amplitude LFO for wave surges (0.08 Hz ≈ every 12 seconds)
        const waveLfo = this.ctx.createOscillator();
        waveLfo.type = 'sine';
        waveLfo.frequency.value = 0.08;

        const waveLfoGain = this.ctx.createGain();
        waveLfoGain.gain.value = 0.3;

        const waveGain = this.ctx.createGain();
        waveGain.gain.value = 0.5;

        waveLfo.connect(waveLfoGain);
        waveLfoGain.connect(waveGain.gain);

        noise.connect(lowpass);
        lowpass.connect(waveGain);
        waveGain.connect(this.getOutputNode());

        noise.start();
        waveLfo.start();

        this.currentSources.push(noise, lowpass, waveLfo, waveLfoGain, waveGain);
    }

    private generateHeartbeat() {
        if (!this.ctx || !this.masterGain) return;

        // Create a rhythmic low-frequency pulse (heartbeat)
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 40; // Sub-bass heartbeat

        const pulseGain = this.ctx.createGain();
        pulseGain.gain.value = 0;

        // Rhythmic amplitude modulation (~72 BPM = 1.2 Hz)
        const pulseLfo = this.ctx.createOscillator();
        pulseLfo.type = 'square'; // Sharp on/off for heartbeat feel
        pulseLfo.frequency.value = 1.2;

        const pulseLfoGain = this.ctx.createGain();
        pulseLfoGain.gain.value = 0.15;

        pulseLfo.connect(pulseLfoGain);
        pulseLfoGain.connect(pulseGain.gain);

        osc.connect(pulseGain);
        pulseGain.connect(this.getOutputNode());

        osc.start();
        pulseLfo.start();

        this.currentSources.push(osc, pulseGain, pulseLfo, pulseLfoGain);
    }

    private generateForestAmbience() {
        if (!this.ctx || !this.masterGain) return;

        const noiseBuffer = this.createNoiseBuffer();
        if (!noiseBuffer) return;

        // Rustling leaves — bandpassed noise with slow modulation
        const noise = this.ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = true;

        const highpass = this.ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 2000; // Airy, rustling quality
        highpass.Q.value = 0.3;

        const rustleGain = this.ctx.createGain();
        rustleGain.gain.value = 0.15;

        // Gentle modulation for natural variation
        const rustleLfo = this.ctx.createOscillator();
        rustleLfo.type = 'sine';
        rustleLfo.frequency.value = 0.15;

        const rustleLfoGain = this.ctx.createGain();
        rustleLfoGain.gain.value = 0.1;

        rustleLfo.connect(rustleLfoGain);
        rustleLfoGain.connect(rustleGain.gain);

        // Birdsong-like oscillation (high-pitched sine with vibrato)
        const birdOsc = this.ctx.createOscillator();
        birdOsc.type = 'sine';
        birdOsc.frequency.value = 2400;

        const vibrato = this.ctx.createOscillator();
        vibrato.type = 'sine';
        vibrato.frequency.value = 5;

        const vibratoGain = this.ctx.createGain();
        vibratoGain.gain.value = 200;

        vibrato.connect(vibratoGain);
        vibratoGain.connect(birdOsc.frequency);

        const birdGain = this.ctx.createGain();
        birdGain.gain.value = 0.02; // Very subtle

        noise.connect(highpass);
        highpass.connect(rustleGain);
        rustleGain.connect(this.getOutputNode());

        birdOsc.connect(birdGain);
        birdGain.connect(this.getOutputNode());

        noise.start();
        rustleLfo.start();
        birdOsc.start();
        vibrato.start();

        this.currentSources.push(
            noise,
            highpass,
            rustleGain,
            rustleLfo,
            rustleLfoGain,
            birdOsc,
            birdGain,
            vibrato,
            vibratoGain,
        );
    }
}
