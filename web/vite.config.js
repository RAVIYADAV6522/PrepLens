import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * No dev proxy, deliberately.
 *
 * A proxy would make the API same-origin in development and hide every CORS
 * and cookie problem until the first deploy. Calling the API on its real
 * origin means development exercises the same cross-origin credentialed path
 * production does — so SameSite and CORS mistakes surface here, not there.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
});
