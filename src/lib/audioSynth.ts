/**
 * Ambient Audio Synthesizer
 * Generates procedural soundscapes using the Web Audio API without external file dependencies.
 */

export class AmbientAudioSynth {
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private currentSources: AudioNode[] = [];
    private activeEmotion: string = '';
    private isPlaying: boolean = false;
    private crossfadeTimeout: ReturnType<typeof setTimeout> | null = null;

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
        if (this.masterGain && this.ctx) {
            this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
            setTimeout(() => {
                this.stopCurrentSources();
            }, 500);
        }
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
    }

    // --- Soundscape Generators ---

    private playEmotionSoundscape(emotion: string) {
        if (!this.ctx || !this.masterGain) return;

        switch (emotion.toLowerCase()) {
            case 'fear':
            case 'sadness':
                this.generateRainAndThunder();
                break;
            case 'anger':
            case 'suspense':
                this.generateDeepRumble();
                break;
            case 'joy':
            case 'surprise':
                this.generateEtherealHum();
                break;
            default:
                this.generateWind();
                break;
        }
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
        lowpass.connect(this.masterGain);

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
        bandpass.connect(this.masterGain);

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
        localGain.connect(this.masterGain);

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
        localGain.connect(this.masterGain);

        osc1.start();
        osc2.start();

        this.currentSources.push(osc1, osc2, localGain);
    }
}
