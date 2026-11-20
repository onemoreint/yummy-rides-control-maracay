import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // En GitHub Pages el sitio vive en /<nombre-del-repo>/
  const base = env.VITE_BASE_PATH || '/';
  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.png', 'apple-touch-icon.png', 'brand/yummy-logo.webp'],
        manifest: {
          name: 'Yummy Rides Control Maracay',
          short_name: 'Yummy Control',
          description: 'Control administrativo de conductores y motocicletas — Yummy Rides Maracay',
          lang: 'es-VE',
          theme_color: '#350064',
          background_color: '#0B0B12',
          display: 'standalone',
          start_url: base,
          scope: base,
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Sólo se cachea la aplicación (HTML/JS/CSS/íconos). NUNCA datos ni documentos de Supabase.
          globPatterns: ['**/*.{js,css,html,png,webp,jpg,svg}'],
          navigateFallbackDenylist: [/^\/auth/, /^\/rest/, /^\/storage/],
          runtimeCaching: [],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        },
      }),
    ],
    build: { chunkSizeWarningLimit: 1200 },
  };
});
