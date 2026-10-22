import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Usernames can contain dots (e.g. /profile/ada.okafor). Vite's built-in SPA
// fallback treats any path with a dot as a static file and returns 404, so
// profile deep links need an explicit HTML rewrite in development.
function profileDeepLinkFallback(): Plugin {
  return {
    name: 'profile-deep-link-fallback',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [pathname, query] = (req.url || '').split('?');
        const wantsHtml = (req.headers.accept || '').includes('text/html');
        if (req.method === 'GET' && wantsHtml && pathname.startsWith('/profile/') && pathname.includes('.')) {
          req.url = `/index.html${query ? `?${query}` : ''}`;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), profileDeepLinkFallback()],
  server: {
    port: 3000,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Keep the heavy realtime-call and PDF engines in their own cacheable
          // vendor chunks. They are only fetched by the Room and Read routes.
          if (id.includes('node_modules/livekit-client') || id.includes('node_modules/@livekit')) {
            return 'livekit';
          }
          if (id.includes('node_modules/react-pdf') || id.includes('node_modules/pdfjs-dist')) {
            return 'pdf';
          }
          return undefined;
        },
      },
    },
  },
});
