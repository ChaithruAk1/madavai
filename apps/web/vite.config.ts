import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
// One source: the app imports the SAME @madav packages the tests verify.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: {
    '@madav/documents': r('../../packages/documents/src/index.ts'),
    '@madav/contracts': r('../../packages/contracts/src/index.ts'),
  } },
});
