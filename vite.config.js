import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          d3: ['d3'],
          chartjs: ['chart.js'],
        }
      }
    }
  },
  worker: {
    format: 'es'
  },
  test: {
    environment: 'node',
    globals: true
  }
});
