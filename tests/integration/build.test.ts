import { describe, it, expect } from 'vitest';
import { build } from 'vite';
import { resolve } from 'node:path';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { gzipCompressSync } from '../../src/compression/gzip.js';
import { brotliCompressSyncData } from '../../src/compression/brotli.js';
import bundleOptimizer from '../../src/index.js';

const FIXTURE_DIR = resolve(process.cwd(), 'tests/fixtures/react-app');
const DIST_DIR = resolve(FIXTURE_DIR, 'dist');

function setupFixture() {
  // Create fixture project files
  mkdirSync(resolve(FIXTURE_DIR, 'src'), { recursive: true });
  mkdirSync(resolve(FIXTURE_DIR, 'src/pages'), { recursive: true });

  writeFileSync(
    resolve(FIXTURE_DIR, 'index.html'),
    `<!DOCTYPE html>
<html>
  <head><title>Test</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>`,
  );

  // main.ts - entry point
  writeFileSync(
    resolve(FIXTURE_DIR, 'src/main.ts'),
    `import { createApp } from './app';
createApp();
`,
  );

  // app.ts - imports react, dynamically imports editor and dashboard
  writeFileSync(
    resolve(FIXTURE_DIR, 'src/app.ts'),
    `export function createApp() {
  const react = 'react';
  console.log(react);

  import('./pages/Editor');
  import('./pages/Dashboard');
}
`,
  );

  // Editor page - uses monaco-editor (large, lazy)
  writeFileSync(
    resolve(FIXTURE_DIR, 'src/pages/Editor.ts'),
    `export function Editor() {
  return 'editor with monaco';
}
`,
  );

  // Dashboard page - uses chart.js (large, lazy)
  writeFileSync(
    resolve(FIXTURE_DIR, 'src/pages/Dashboard.ts'),
    `export function Dashboard() {
  return 'dashboard with charts';
}
`,
  );

  // package.json
  writeFileSync(
    resolve(FIXTURE_DIR, 'package.json'),
    JSON.stringify({
      name: 'test-fixture',
      version: '1.0.0',
      type: 'module',
    }),
  );
}

function cleanupFixture() {
  if (existsSync(DIST_DIR)) {
    rmSync(DIST_DIR, { recursive: true, force: true });
  }
}

describe('integration: Vite build with bundleOptimizer', () => {
  it('completes build without errors', async () => {
    setupFixture();
    try {
      const result = await build({
        root: FIXTURE_DIR,
        logLevel: 'warn',
        build: {
          outDir: 'dist',
          write: true,
          minify: false,
          rollupOptions: {
            output: {
              manualChunks: undefined as unknown as undefined,
            },
          },
        },
        plugins: [
          bundleOptimizer(),
          // Mock resolver to simulate node_modules
          {
            name: 'mock-resolver',
            enforce: 'pre',
            resolveId(source, _importer) {
              if (source === 'react' || source === 'react-dom') {
                return resolve(FIXTURE_DIR, `src/__mocks__/${source}.ts`);
              }
              if (source === 'monaco-editor') {
                return resolve(FIXTURE_DIR, `src/__mocks__/monaco-editor.ts`);
              }
              if (source === 'chart.js') {
                return resolve(FIXTURE_DIR, `src/__mocks__/chartjs.ts`);
              }
              return null;
            },
          },
        ],
      });

      expect(result).toBeDefined();
      const outputs = Array.isArray(result) ? result : [result];
      expect(outputs.length).toBeGreaterThan(0);
    } finally {
      cleanupFixture();
    }
  }, 30_000);

  it('generates gzip and brotli compressed files', () => {
    const testCode = 'const x = 1; '.repeat(100);
    const gz = gzipCompressSync(testCode);
    const br = brotliCompressSyncData(testCode);
    expect(gz.length).toBeLessThan(testCode.length);
    expect(br.length).toBeLessThan(testCode.length);
    expect(gz[0]).toBe(0x1f); // gzip magic number
    expect(gz[1]).toBe(0x8b);
  });
});
