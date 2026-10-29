import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build-time prerender of the legal pages. Google's privacy-policy reviewer and
// ordinary crawlers request /privacy and /terms without executing JavaScript,
// and the SPA shell alone contains no policy text.
export default defineConfig({
  plugins: [react()],
  build: {
    ssr: 'scripts/prerender.tsx',
    outDir: '.prerender',
    emptyOutDir: true,
    minify: false,
  },
  ssr: {
    // The workspace packages ship raw TypeScript, so they must be bundled
    // rather than left for Node to resolve.
    noExternal: ['@curious-bright/ui-kit'],
  },
});
