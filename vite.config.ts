/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    build: {
      target: 'esnext',
    },
    esbuild: {
      tsconfigRaw: {
        compilerOptions: {
          experimentalDecorators: true,
          useDefineForClassFields: false,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
