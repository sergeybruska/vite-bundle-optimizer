import { gzipCompressSync } from './gzip.js';
import { brotliCompressSyncData } from './brotli.js';
import type { ResolvedConfig } from '../types/index.js';

export { gzipCompressSync, gzipCompress, gzipSize } from './gzip.js';
export { brotliCompressSyncData, brotliCompressData, brotliSize } from './brotli.js';

import type { OutputAsset, OutputBundle } from 'rollup';

/** Compress all JS/CSS assets in the bundle, adding .gz and .br files. */
export function compressBundle(bundle: OutputBundle, config: ResolvedConfig): void {
  const assets = Object.entries(bundle).filter(
    ([, asset]) => asset.type === 'asset',
  ) as [string, OutputAsset][];

  for (const [fileName, asset] of assets) {
    if (!fileName.endsWith('.js') && !fileName.endsWith('.css')) continue;

    const source = typeof asset.source === 'string' ? asset.source : Buffer.from(asset.source);

    if (config.compression.gzip) {
      const gz = gzipCompressSync(source, config.compression.gzipLevel);
      bundle[`${fileName}.gz`] = {
        type: 'asset',
        fileName: `${fileName}.gz`,
        name: undefined,
        names: [],
        originalFileName: null,
        originalFileNames: [],
        source: gz,
        needsCodeReference: false,
      } as unknown as OutputAsset;
    }

    if (config.compression.brotli) {
      const br = brotliCompressSyncData(source, config.compression.brotliQuality);
      bundle[`${fileName}.br`] = {
        type: 'asset',
        fileName: `${fileName}.br`,
        name: undefined,
        names: [],
        originalFileName: null,
        originalFileNames: [],
        source: br,
        needsCodeReference: false,
      } as unknown as OutputAsset;
    }
  }
}
