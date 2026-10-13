import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    // DuckDB-WASM-Binaries sind groß; 4 MB Chunk-Limit vermeidet Build-Warnungen
    chunkSizeWarningLimit: 4096,
  },
});
