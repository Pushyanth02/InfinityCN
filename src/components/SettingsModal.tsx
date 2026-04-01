import React, { useEffect, useRef } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, title = 'Settings', children }) => {
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap and Escape key
  useEffect(() => {
    if (!isOpen) return;
    const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable && focusable.length) focusable[0].focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && focusable && focusable.length) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    const node = modalRef.current;
    node?.addEventListener('keydown', handleKeyDown);
    return () => node?.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="cine-modal-backdrop"
      tabIndex={-1}
      aria-modal="true"
      role="dialog"
      aria-labelledby="settings-modal-title"
      aria-describedby="settings-modal-desc"
      onClick={onClose}
    >
      <div
        className="cine-modal-content"
        ref={modalRef}
        tabIndex={0}
        role="document"
        aria-label="Settings content"
        onClick={e => e.stopPropagation()}
      >
        <div className="cine-modal-header">
          <h2 id="settings-modal-title" className="cine-modal-title">{title}</h2>
          <span id="settings-modal-desc" className="visually-hidden">Application settings and preferences</span>
          <button
            className="cine-btn--icon"
            onClick={onClose}
            aria-label="Close settings"
          >
            ×
          </button>
        </div>
        <div className="cine-modal-body">{children}</div>
      </div>
    </div>
  );
};

export default SettingsModal;
