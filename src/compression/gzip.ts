import { gzipSync, gzip } from 'node:zlib';
import { promisify } from 'node:util';

const gzipAsync = promisify(gzip);

export function gzipCompressSync(data: string | Buffer, level: number = 9): Buffer {
  return gzipSync(typeof data === 'string' ? Buffer.from(data, 'utf-8') : data, {
    level,
  });
}

export async function gzipCompress(data: string | Buffer, level: number = 9): Promise<Buffer> {
  return gzipAsync(typeof data === 'string' ? Buffer.from(data, 'utf-8') : data, {
    level,
  });
}

export function gzipSize(data: string | Buffer, level: number = 9): number {
  return gzipCompressSync(data, level).length;
}
