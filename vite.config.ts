import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.ico'],
            manifest: {
                name: 'InfinityCN',
                short_name: 'InfinityCN',
                description: 'Offline-first AI-enhanced novel reader',
                theme_color: '#e53935',
                background_color: '#0a0a0f',
                display: 'standalone',
                start_url: '/',
                icons: [
                    { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any maskable',
                    },
                ],
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
                runtimeCaching: [
                    {
                        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'google-fonts-cache',
                            expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                    {
                        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'gstatic-fonts-cache',
                            expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                ],
            },
        }),
    ],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/test/setup.ts'],
        include: ['src/**/*.test.{ts,tsx}'],
        css: false,
    },
    build: {
        target: 'esnext',
        minify: 'esbuild',
        sourcemap: 'hidden',
        chunkSizeWarningLimit: 800,
        rollupOptions: {
            output: {
                manualChunks: id => {
                    // PDF processing — only load when user drops a file
                    if (id.includes('pdfjs-dist')) return 'pdfjs';
                    // ZIP extraction for EPUB/DOCX/PPTX — lazy loaded
                    if (id.includes('fflate')) return 'fflate';
                    // OCR — lazy loaded only for scanned PDFs
                    if (id.includes('tesseract.js')) return 'tesseract';
                    // ML runtime (shared by tesseract + @xenova/transformers) — lazy loaded
                    if (id.includes('onnxruntime-web') || id.includes('onnxruntime-common'))
                        return 'onnx';
                    // Embeddings model — lazy loaded during cinematification
                    if (id.includes('@xenova/transformers')) return 'transformers';
                    // Animation library — lazy chunk
                    if (id.includes('framer-motion')) return 'motion';
                    // Icons — tree-shaken but grouped
                    if (id.includes('lucide-react')) return 'lucide';
                    // IndexedDB — dexie
                    if (id.includes('dexie')) return 'dexie';
                    // Zustand
                    if (id.includes('zustand')) return 'store';
                    // Analytics — deferred from critical path
                    if (id.includes('@vercel/analytics') || id.includes('@vercel/speed-insights'))
                        return 'analytics';
                    // React core — always needed
                    if (
                        id.includes('node_modules/react/') ||
                        id.includes('node_modules/react-dom/')
                    ) {
                        return 'react';
                    }
                },
            },
        },
    },
});
