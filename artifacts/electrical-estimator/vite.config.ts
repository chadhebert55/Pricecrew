import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const entryChunkBudgetBytes = 500_000;
const entryChunkReportPrefix = 'ELECTRICAL_ESTIMATOR_ENTRY_CHUNK ';

function entryChunkReportPlugin() {
  return {
    name: 'electrical-estimator-entry-chunk-report',
    writeBundle(
      _options: unknown,
      bundle: Record<
        string,
        { type: string; isEntry?: boolean; code?: string }
      >,
    ) {
      const entryChunk = Object.values(bundle).find(
        (output) => output.type === 'chunk' && output.isEntry,
      );

      if (!entryChunk || typeof entryChunk.code !== 'string') {
        throw new Error('Could not find the electrical estimator entry chunk.');
      }

      const sizeBytes = Buffer.byteLength(entryChunk.code, 'utf8');

      console.log(
        `${entryChunkReportPrefix}${JSON.stringify({
          fileName: Object.entries(bundle).find(
            ([, output]) => output === entryChunk,
          )?.[0],
          sizeBytes,
          budgetBytes: entryChunkBudgetBytes,
          withinBudget: sizeBytes <= entryChunkBudgetBytes,
        })}`,
      );
    },
  };
}

const replitPlugins =
  process.env.NODE_ENV !== 'production' && process.env.REPL_ID !== undefined
    ? [
        await import('@replit/vite-plugin-cartographer').then((m) =>
          m.cartographer({
            root: path.resolve(import.meta.dirname, '..'),
          }),
        ),
        await import('@replit/vite-plugin-dev-banner').then((m) =>
          m.devBanner(),
        ),
      ]
    : [];

export default defineConfig(({ command, mode }) => {
  const isBuild = command === 'build';
  const rawPort = process.env.PORT;

  if (!rawPort && !isBuild) {
    throw new Error(
      'PORT environment variable is required but was not provided.',
    );
  }

  const port = rawPort ? Number(rawPort) : 5173;

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  const basePath = process.env.BASE_PATH;

  if (!basePath && !isBuild) {
    throw new Error(
      'BASE_PATH environment variable is required but was not provided.',
    );
  }

  return {
    base: basePath ?? '/',
    plugins: [
      react(),
      tailwindcss({ optimize: false }),
      entryChunkReportPlugin(),
      runtimeErrorOverlay(),
      ...replitPlugins,
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
        '@assets': path.resolve(
          import.meta.dirname,
          '..',
          '..',
          'attached_assets',
        ),
      },
      dedupe: ['react', 'react-dom'],
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: process.env.BUNDLE_CHECK_OUTPUT_DIR
        ? path.resolve(process.env.BUNDLE_CHECK_OUTPUT_DIR)
        : path.resolve(import.meta.dirname, 'dist/public'),
      emptyOutDir: true,
    },
    server: {
      port,
      strictPort: true,
      host: '0.0.0.0',
      allowedHosts: true,
      proxy:
        mode === 'e2e' && process.env.E2E_API_URL
          ? {
              '/api': {
                target: process.env.E2E_API_URL,
              },
            }
          : undefined,
      fs: {
        strict: true,
      },
    },
    preview: {
      port,
      host: '0.0.0.0',
      allowedHosts: true,
    },
  };
});
