import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: 'hidden',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // PDF processing — only load when user drops a file
          if (id.includes('pdfjs-dist')) return 'pdfjs';
          // Animation library — lazy chunk
          if (id.includes('framer-motion')) return 'motion';
          // Icons — tree-shaken but grouped
          if (id.includes('lucide-react')) return 'lucide';
          // IndexedDB — only needed after first compile
          if (id.includes('dexie')) return 'dexie';
          // Zustand
          if (id.includes('zustand')) return 'store';
          // React core — always needed
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react';
          }
        }
      }
    }
  }
})
