interface ScrubberProps {
    progress: number; // 0 to 100
    className?: string;
}

export function Scrubber({ progress, className = '' }: ScrubberProps) {
    return (
        <div className={`scrubber-track ${className}`}>
            <div
                className="scrubber-fill"
                style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
            >
                <div className="scrubber-playhead"></div>
            </div>
        </div>
    );
}
