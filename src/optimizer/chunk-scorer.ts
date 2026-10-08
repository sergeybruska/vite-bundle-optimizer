import type { ChunkScore } from '../types/index.js';

/** Score a potential chunk grouping. Higher = more beneficial. */
export function scoreChunk(params: {
  sizeSaving: number;
  duplicatedBytesSaved: number;
  requestCost: number;
  initialLoadImpact: number;
  cacheability: number;
}): ChunkScore {
  const totalScore =
    params.sizeSaving +
    params.duplicatedBytesSaved +
    params.cacheability -
    params.requestCost -
    params.initialLoadImpact;

  return {
    sizeSaving: params.sizeSaving,
    duplicatedBytesSaved: params.duplicatedBytesSaved,
    requestCost: params.requestCost,
    initialLoadImpact: params.initialLoadImpact,
    cacheability: params.cacheability,
    totalScore,
  };
}

/** Estimate per-request overhead cost by protocol. */
export function estimateRequestCost(
  chunkSize: number,
  protocol: 'http1' | 'http2' | 'http3' | 'auto',
): number {
  const baseOverhead = {
    http1: 500,
    http2: 200,
    http3: 150,
    auto: 200,
  };

  return baseOverhead[protocol];
}

/** Estimate cacheability benefit of vendor chunks (stable, long-term caching). */
export function estimateCacheability(
  isVendor: boolean,
  chunkSize: number,
): number {
  if (!isVendor) return 0;
  return Math.min(chunkSize * 0.1, 50_000);
}
