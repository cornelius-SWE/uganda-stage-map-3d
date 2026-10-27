import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => ({
  // Relative paths so the built site works from any folder or sub-path.
  base: './',
  // The preview build is one self-contained HTML file.
  plugins: mode === 'demo' ? [viteSingleFile()] : [],
  build: { chunkSizeWarningLimit: 4000 },
}));
