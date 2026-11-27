import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('lightweight-charts')) return 'charts';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('@tanstack/react-query') || id.includes('zustand')) return 'state';
        },
      },
    },
  },
});
