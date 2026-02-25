import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App.tsx';

// Catch unhandled promise rejections so they don't fail silently
window.addEventListener('unhandledrejection', e => {
    console.error('[Unhandled Rejection]', e.reason);
});

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element in index.html');

createRoot(root).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
