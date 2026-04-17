import React, { useState } from 'react';

interface APIKeyInputProps {
    id: string;
    label: string;
    value: string;
    placeholder?: string;
    onChange: (value: string) => void;
    onTest?: () => void;
    isTesting?: boolean;
    testStatus?: { ok: boolean; message: string; latencyMs?: number } | null;
}

export const APIKeyInput: React.FC<APIKeyInputProps> = ({
    id,
    label,
    value,
    placeholder = '',
    onChange,
    onTest,
    isTesting = false,
    testStatus = null,
}) => {
    const [show, setShow] = useState(false);

    return (
        <div className="cine-input-group">
            <label htmlFor={id}>{label}</label>
            <div className="cine-key-input-row">
                <input
                    id={id}
                    type={show ? 'text' : 'password'}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    autoComplete="off"
                />
                <button
                    type="button"
                    className="cine-btn--icon"
                    aria-label={show ? 'Hide API key' : 'Show API key'}
                    onClick={() => setShow(s => !s)}
                >
                    {show ? '🙈' : '👁️'}
                </button>
                {onTest && (
                    <button
                        type="button"
                        className="cine-btn cine-btn--sm"
                        onClick={onTest}
                        disabled={isTesting}
                    >
                        {isTesting ? 'Testing...' : 'Test'}
                    </button>
                )}
            </div>
            {testStatus && (
                <div className={`cine-test-result ${testStatus.ok ? 'success' : 'error'}`}>
                    {testStatus.ok ? '✔️' : '❌'} {testStatus.message}
                    {testStatus.latencyMs && (
                        <span className="latency">{testStatus.latencyMs}ms</span>
                    )}
                </div>
            )}
        </div>
    );
};

export default APIKeyInput;
