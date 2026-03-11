/**
 * UploadZone.tsx — Drag-and-Drop File Upload Component
 *
 * Handles file selection via drag-drop or click-to-browse,
 * with format validation and visual feedback.
 */

import React, { useState, useCallback, useRef } from 'react';
import { Upload } from 'lucide-react';
import { detectFormat, ACCEPTED_EXTENSIONS } from '../lib/pdfWorker';

interface UploadZoneProps {
    onFileSelect: (file: File) => void;
    isProcessing: boolean;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ onFileSelect, isProcessing }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [dropError, setDropError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            setDropError(null);

            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const file = files[0];
                try {
                    detectFormat(file);
                    onFileSelect(file);
                } catch (err) {
                    setDropError(err instanceof Error ? err.message : 'Unsupported file format');
                }
            }
        },
        [onFileSelect],
    );

    const handleFileChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const files = e.target.files;
            if (files && files.length > 0) {
                const file = files[0];
                try {
                    detectFormat(file);
                    onFileSelect(file);
                } catch (err) {
                    setDropError(err instanceof Error ? err.message : 'Unsupported file format');
                }
            }
        },
        [onFileSelect],
    );

    return (
        <div
            className={`cine-upload-zone ${isDragging ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isProcessing && inputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Upload a document file"
            onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
            }}
        >
            <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                style={{ display: 'none' }}
                onChange={handleFileChange}
                disabled={isProcessing}
            />
            <div className="cine-upload-content">
                <Upload size={48} className="cine-upload-icon" />
                <p className="cine-upload-text">
                    {isDragging ? 'Drop your file here' : 'Drop a document or click to upload'}
                </p>
                <p className="cine-upload-hint">PDF, EPUB, DOCX, PPTX, TXT supported</p>
                {dropError && (
                    <p className="cine-upload-error" role="alert">
                        {dropError}
                    </p>
                )}
            </div>
        </div>
    );
};
