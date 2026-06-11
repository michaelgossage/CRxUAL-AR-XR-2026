import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  appType: 'mpa',
  plugins: [basicSsl(), cloudflare()],
  server: {
    host: true,
  },
  build: {
    target: 'es2020',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
});