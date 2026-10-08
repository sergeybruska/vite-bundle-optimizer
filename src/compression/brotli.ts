import { brotliCompressSync, brotliCompress } from 'node:zlib';
import { promisify } from 'node:util';
import type { BrotliOptions } from 'node:zlib';

const brotliAsync = promisify(brotliCompress);

function getBrotliOptions(quality: number): BrotliOptions {
  return {
    params: {
      [0x01]: quality, // BROTLI_PARAM_QUALITY
    },
  };
}

export function brotliCompressSyncData(data: string | Buffer, quality: number = 11): Buffer {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  return brotliCompressSync(buf, getBrotliOptions(quality));
}

export async function brotliCompressData(
  data: string | Buffer,
  quality: number = 11,
): Promise<Buffer> {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  return brotliAsync(buf, getBrotliOptions(quality));
}

export function brotliSize(data: string | Buffer, quality: number = 11): number {
  return brotliCompressSyncData(data, quality).length;
}
