import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev mode, forward /api calls to the Node backend.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3001' } },
});
