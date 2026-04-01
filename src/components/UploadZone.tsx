/**
 * UploadZone.tsx — Cinematic manuscript upload panel
 *
 * Velvet Noir design system — "upload_processing_dark" reference.
 * Ghost-border dashed upload area, gradient CTA, ember glow hover effect.
 */

import React, { useCallback, useState, useRef } from 'react';
import { Upload, FileText } from 'lucide-react';

interface UploadZoneProps {
    onFileSelect: (file: File) => void;
    isProcessing: boolean;
    compact?: boolean;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ onFileSelect, isProcessing, compact = false }) => {
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFile = useCallback(
        (file: File) => {
            if (!isProcessing && (file.type === 'application/pdf' || file.name.endsWith('.txt') || file.name.endsWith('.epub'))) {
                onFileSelect(file);
            }
        },
        [onFileSelect, isProcessing],
    );

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
        },
        [handleFile],
    );

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback(() => setIsDragging(false), []);

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
        },
        [handleFile],
    );

    if (compact) {
        return (
            <label className="upload-compact" aria-label="Upload a new manuscript">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.txt,.epub"
                    onChange={handleChange}
                    disabled={isProcessing}
                    className="upload-input-hidden"
                    aria-label="Select a PDF, TXT, or EPUB file"
                />
                <Upload size={16} aria-hidden="true" />
                Browse files
            </label>
        );
    }

    return (
        <div
            className={`upload-zone ${isDragging ? 'upload-zone--active' : ''} ${isProcessing ? 'upload-zone--processing' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            role="button"
            tabIndex={0}
            aria-label="Upload zone: drag and drop or click to select a manuscript"
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
        >
            <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.epub"
                onChange={handleChange}
                disabled={isProcessing}
                className="upload-input-hidden"
                id="manuscript-file-input"
                aria-label="Select a PDF, TXT, or EPUB file"
            />

            {/* Icon */}
            <div className={`upload-icon-ring ${isDragging ? 'upload-icon-ring--active' : ''}`} aria-hidden="true">
                <Upload size={28} strokeWidth={1.5} color="var(--primary)" />
            </div>

            {/* Text */}
            <div className="upload-text-group">
                <p className="upload-headline">
                    {isDragging ? 'Drop it here' : 'Drop your manuscript'}
                </p>
                <p className="upload-subtext">
                    PDF, TXT, or EPUB · up to 50 MB
                </p>
            </div>

            {/* CTA Button */}
            <label
                htmlFor="manuscript-file-input"
                className="upload-cta-btn"
                role="button"
                tabIndex={-1}
                aria-label="Select a manuscript file from your device"
            >
                <FileText size={16} aria-hidden="true" />
                Select Manuscript
            </label>

            <p className="upload-footnote">
                Processed locally — your manuscript never leaves your device
            </p>
        </div>
    );
};

export default UploadZone;
