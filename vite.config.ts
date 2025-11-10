import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
  },
  optimizeDeps: {
    include: ['pdfjs-dist', 'html2canvas', 'jspdf'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'pdfjs': ['pdfjs-dist'],
          'pdf-utils': ['html2canvas', 'jspdf'],
        },
      },
    },
  },
});
