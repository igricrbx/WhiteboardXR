import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  server: {
    https: {
      key: fs.readFileSync(path.resolve(__dirname, '../certs/key.pem')),
      cert: fs.readFileSync(path.resolve(__dirname, '../certs/cert.pem'))
    },
    host: '0.0.0.0', // Allow access from network
    port: 5173,
    hmr: {
      protocol: 'wss',
      clientPort: 5173
    }
  }
});
