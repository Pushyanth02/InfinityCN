import React, { useCallback, useState } from 'react';

const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ACCEPTED_TYPES = ['application/pdf', 'text/plain'];
const ACCEPTED_EXTS = ['.pdf', '.txt'];

interface UploadProps {
    onFileSelect: (file: File) => void;
    isLoading: boolean;
}

function isAccepted(file: File): boolean {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    return ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXTS.includes(ext);
}

export const Upload: React.FC<UploadProps> = ({ onFileSelect, isLoading }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [sizeError, setSizeError] = useState<string | null>(null);
    const [droppedName, setDroppedName] = useState<string | null>(null);

    const handleFile = useCallback((file: File) => {
        setSizeError(null);
        if (!isAccepted(file)) {
            setSizeError(`Unsupported file type. Please use PDF or TXT files.`);
            return;
        }

        if (file.size > MAX_FILE_BYTES) {
            setSizeError(`File too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Max is ${MAX_FILE_SIZE_MB} MB.`);
            return;
        }
        setDroppedName(file.name);
        onFileSelect(file);
    }, [onFileSelect]);

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') setIsDragging(true);
        else setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
    }, [handleFile]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        e.preventDefault();
        const file = e.target.files?.[0];
        if (file) handleFile(file);
        e.target.value = '';   // allow re-selecting the same file
    }, [handleFile]);

    const isBusy = isLoading;

    return (
        <div>
            <label
                className={`upload-zone ${isDragging ? 'dragging' : ''} ${isBusy ? 'loading' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                role="button"
                aria-label="Upload a PDF or TXT file"
                aria-disabled={isBusy ? "true" : "false"}
                tabIndex={isBusy ? -1 : 0}
                onKeyDown={e => {
                    if (!isBusy && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        document.getElementById('file-upload-input')?.click();
                    }
                }}
            >
                <div className="upload-eyebrow" aria-hidden="true">Source Text</div>

                <div className="upload-title" aria-hidden="true">
                    <span className="plus-icon" aria-hidden="true">+</span>
                    {isBusy
                        ? 'Parsing Fragment…'
                        : droppedName
                            ? droppedName
                            : 'Drop Source Text'
                    }
                </div>

                <p className="upload-subtitle">
                    {isBusy
                        ? 'Extracting narrative structure…'
                        : 'PDF or TXT — drag & drop or click to browse. Let AI enhance your reading.'}
                </p>

                <input
                    id="file-upload-input"
                    type="file"
                    className="upload-input-hidden"
                    aria-hidden="true"
                    tabIndex={-1}
                    accept="application/pdf,text/plain,.pdf,.txt"
                    onChange={handleChange}
                    disabled={isBusy}
                />
            </label>

            {sizeError && (
                <p role="alert" className="upload-size-error">
                    ⚠ {sizeError}
                </p>
            )}
        </div>
    );
};
