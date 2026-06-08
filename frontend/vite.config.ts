import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server config. Port and the optional API proxy are env-driven so the
// nginx/edge topology works WITHOUT changing the committed defaults:
//   VITE_PORT             — dev server port (default 5173; e.g. 5174 when 5173 is
//                           already taken by another local app).
//   VITE_API_PROXY_TARGET — when set, /api/* is proxied to this target (e.g. the
//                           local nginx at https://localhost:8443). `secure: false`
//                           accepts the self-signed local cert. This keeps the
//                           browser same-origin on the Vite port (no CORS, no
//                           self-signed-cert prompt). Pair it with
//                           VITE_API_BASE_URL=/api in frontend/.env so the API
//                           client emits relative /api/... URLs.
// When VITE_API_PROXY_TARGET is unset, behavior is unchanged: the frontend talks
// to whatever VITE_API_BASE_URL points at (default http://localhost:3001).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_API_PROXY_TARGET?.trim();

  return {
    plugins: [react()],
    server: {
      port: Number(env.VITE_PORT) || 5173,
      // Fail loudly if the port is taken instead of silently hopping to the
      // next free port (which lands ClinicBridge on an unexpected port and
      // looks like "it stopped working"). See frontend/.env VITE_PORT.
      strictPort: true,
      proxy: proxyTarget
        ? {
            '/api': {
              target: proxyTarget,
              changeOrigin: true,
              secure: false, // local nginx terminates TLS with a self-signed cert
              rewrite: (path) => path.replace(/^\/api/, ''),
            },
          }
        : undefined,
    },
  };
});
