import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        index: resolve(here, 'index.html'),
        gallery: resolve(here, 'gallery.html'),
        directions: resolve(here, 'directions.html'),
      },
    },
  },
});
