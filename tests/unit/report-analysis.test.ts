import { describe, it, expect } from 'vitest';
import {
  computeBundleReport,
  findInitialChunks,
  isVendorChunk,
} from '../../src/report/analysis.js';
import type { OutputBundle, OutputChunk } from 'rollup';

function makeChunk(
  fileName: string,
  name: string,
  code: string,
  opts: { isEntry?: boolean; imports?: string[]; dynamicImports?: string[] } = {},
): OutputChunk {
  return {
    type: 'chunk',
    fileName,
    name,
    code,
    isEntry: opts.isEntry ?? false,
    imports: opts.imports ?? [],
    dynamicImports: opts.dynamicImports ?? [],
    facadeModuleId: null,
    exports: [],
    modules: {},
    referencedFiles: [],
    preliminaryFileName: fileName,
    map: null,
  } as unknown as OutputChunk;
}

describe('findInitialChunks', () => {
  it('identifies entry chunks as initial', () => {
    const bundle: OutputBundle = {
      'index.js': makeChunk('index.js', 'index', 'code', { isEntry: true }),
    };
    const initial = findInitialChunks(bundle);
    expect(initial.has('index.js')).toBe(true);
  });

  it('follows static imports from entries', () => {
    const bundle: OutputBundle = {
      'index.js': makeChunk('index.js', 'index', 'code', {
        isEntry: true,
        imports: ['vendor-react.js'],
      }),
      'vendor-react.js': makeChunk('vendor-react.js', 'vendor-react', 'code'),
      'editor.js': makeChunk('editor.js', 'editor', 'code', { dynamicImports: [] }),
    };
    const initial = findInitialChunks(bundle);
    expect(initial.has('index.js')).toBe(true);
    expect(initial.has('vendor-react.js')).toBe(true);
    expect(initial.has('editor.js')).toBe(false);
  });

  it('excludes dynamically imported chunks from initial', () => {
    // chunk.imports includes ALL imports; chunk.dynamicImports is the dynamic subset.
    // A chunk in both should NOT be initial.
    const bundle: OutputBundle = {
      'index.js': makeChunk('index.js', 'index', 'code', {
        isEntry: true,
        imports: ['vendor-react.js', 'editor.js'],
        dynamicImports: ['editor.js'],
      }),
      'vendor-react.js': makeChunk('vendor-react.js', 'vendor-react', 'code'),
      'editor.js': makeChunk('editor.js', 'editor', 'code'),
    };
    const initial = findInitialChunks(bundle);
    expect(initial.has('index.js')).toBe(true);
    expect(initial.has('vendor-react.js')).toBe(true);
    // editor.js is in imports AND dynamicImports → NOT initial
    expect(initial.has('editor.js')).toBe(false);
  });

  it('includes chunk that is both static and dynamic import', () => {
    // Statically imported by one chunk, dynamically by another → initial (static wins)
    const bundle: OutputBundle = {
      'index.js': makeChunk('index.js', 'index', 'code', {
        isEntry: true,
        imports: ['vendor-react.js', 'editor.js'],
        dynamicImports: ['editor.js'],
      }),
      'vendor-react.js': makeChunk('vendor-react.js', 'vendor-react', 'code', {
        imports: ['editor.js'],
      }),
      'editor.js': makeChunk('editor.js', 'editor', 'code'),
    };
    const initial = findInitialChunks(bundle);
    // editor.js is dynamically imported by index.js but statically imported by
    // vendor-react.js (initial) → editor.js IS initial
    expect(initial.has('vendor-react.js')).toBe(true);
    expect(initial.has('editor.js')).toBe(true);
  });
});

describe('isVendorChunk', () => {
  it('identifies vendor chunks by name', () => {
    expect(isVendorChunk('vendor-react')).toBe(true);
    expect(isVendorChunk('vendor-react-lazy')).toBe(true);
    expect(isVendorChunk('vendor')).toBe(true);
    expect(isVendorChunk('shared-vendor')).toBe(true);
    expect(isVendorChunk('index')).toBe(false);
    expect(isVendorChunk('editor')).toBe(false);
  });
});

describe('computeBundleReport', () => {
  it('computes before/after sizes correctly', () => {
    const bundle: OutputBundle = {
      'index.js': makeChunk('index.js', 'index', 'x'.repeat(50_000), {
        isEntry: true,
        imports: ['vendor-react.js'],
      }),
      'vendor-react.js': makeChunk('vendor-react.js', 'vendor-react', 'x'.repeat(30_000)),
      'vendor-editor-lazy.js': makeChunk(
        'vendor-editor-lazy.js',
        'vendor-editor-lazy',
        'x'.repeat(40_000),
      ),
    };

    const report = computeBundleReport(bundle);

    // After initial = index + vendor-react (vendor-editor-lazy is lazy)
    expect(report.after.initial.raw).toBe(80_000);
    // Before initial = total of ALL chunks (no code splitting)
    expect(report.before.initial.raw).toBe(120_000);
    expect(report.after.total.raw).toBe(120_000);
    // Before: 1 chunk; After: 2 initial chunks
    expect(report.before.chunks).toBe(1);
    expect(report.after.chunks).toBe(2);
  });

  it('computes gzip and brotli sizes', () => {
    const bundle: OutputBundle = {
      'index.js': makeChunk('index.js', 'index', 'const x = 1; '.repeat(100), {
        isEntry: true,
      }),
    };

    const report = computeBundleReport(bundle);
    expect(report.after.initial.gzip).toBeGreaterThan(0);
    expect(report.after.initial.gzip).toBeLessThan(report.after.initial.raw);
    expect(report.after.initial.brotli).toBeGreaterThan(0);
    expect(report.after.initial.brotli).toBeLessThan(report.after.initial.raw);
  });

  it('generates recommendations for large initial chunks', () => {
    const bundle: OutputBundle = {
      'index.js': makeChunk('index.js', 'index', 'x'.repeat(600_000), {
        isEntry: true,
      }),
    };

    const report = computeBundleReport(bundle);
    expect(report.recommendations.length).toBeGreaterThan(0);
    // Should mention 'index'
    expect(report.recommendations.some((r) => r.includes('index'))).toBe(true);
  });

  it('sorts chunks by size descending', () => {
    const bundle: OutputBundle = {
      'small.js': makeChunk('small.js', 'small', 'x'.repeat(10_000), { isEntry: true }),
      'big.js': makeChunk('big.js', 'big', 'x'.repeat(100_000)),
      'medium.js': makeChunk('medium.js', 'medium', 'x'.repeat(50_000)),
    };

    const report = computeBundleReport(bundle);
    expect(report.chunks[0].size).toBeGreaterThanOrEqual(report.chunks[1].size);
    expect(report.chunks[1].size).toBeGreaterThanOrEqual(report.chunks[2].size);
  });
});
