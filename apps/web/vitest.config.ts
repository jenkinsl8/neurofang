import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const resolveFromRoot = (relativePath: string) => fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    alias: {
      react: resolveFromRoot('../../node_modules/react'),
      'react-dom': resolveFromRoot('../../node_modules/react-dom'),
      'react/jsx-runtime': resolveFromRoot('../../node_modules/react/jsx-runtime.js'),
      'react/jsx-dev-runtime': resolveFromRoot('../../node_modules/react/jsx-dev-runtime.js')
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
    include: ['**/*.test.ts', '**/*.test.tsx']
  }
});
