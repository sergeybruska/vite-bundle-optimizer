import { describe, it, expect } from 'vitest';
import { gzipSize, gzipCompressSync } from '../../src/compression/gzip.js';
import { brotliSize, brotliCompressSyncData } from '../../src/compression/brotli.js';

describe('gzip compression', () => {
  it('compresses data and returns smaller buffer', () => {
    const data = 'hello world '.repeat(100);
    const compressed = gzipCompressSync(data);
    expect(compressed.length).toBeLessThan(data.length);
  });

  it('gzipSize returns the compressed size', () => {
    const data = 'const x = 1; '.repeat(100);
    const size = gzipSize(data);
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(data.length);
  });

  it('higher level produces smaller or equal output', () => {
    const data = 'const x = 1; '.repeat(200);
    const size1 = gzipSize(data, 1);
    const size9 = gzipSize(data, 9);
    expect(size9).toBeLessThanOrEqual(size1);
  });

  it('handles empty input', () => {
    const size = gzipSize('');
    expect(size).toBeGreaterThan(0); // gzip header overhead
  });
});

describe('brotli compression', () => {
  it('compresses data and returns smaller buffer', () => {
    const data = 'hello world '.repeat(100);
    const compressed = brotliCompressSyncData(data);
    expect(compressed.length).toBeLessThan(data.length);
  });

  it('brotliSize returns the compressed size', () => {
    const data = 'const x = 1; '.repeat(100);
    const size = brotliSize(data);
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(data.length);
  });

  it('brotli typically compresses better than gzip for text', () => {
    const data = 'function foo() { return 42; } '.repeat(100);
    const gz = gzipSize(data);
    const br = brotliSize(data);
    expect(br).toBeLessThanOrEqual(gz);
  });

  it('handles empty input', () => {
    const size = brotliSize('');
    expect(size).toBeGreaterThanOrEqual(0);
  });
});
