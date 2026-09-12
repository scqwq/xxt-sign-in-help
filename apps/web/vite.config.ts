import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
  const env = loadEnv(mode, projectRoot, '');
  const parsePort = (value: string | undefined, fallback: number) => {
    const port = Number(value);
    return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback;
  };
  const serverPort = parsePort(env.PORT, 5000);
  const webPort = parsePort(env.VITE_PORT, 3000);

  return {
    plugins: [react(), visualizer()],
    envDir: projectRoot,
    define: {
      'import.meta.env.VITE_SERVER_PORT': JSON.stringify(String(serverPort)),
    },
    server: {
      port: webPort,
      strictPort: true
    },
    preview: {
      port: webPort,
      strictPort: true
    },
    base: '/',
    build: {
      sourcemap: false
    },
    optimizeDeps: { include: ['crypto-js'] }
  };
});
