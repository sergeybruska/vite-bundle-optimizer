import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BundleReport, ChunkInfo } from '../types/index.js';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#39;');
}

/** Generate an HTML visualization of the bundle report. */
export function generateHtmlReport(report: BundleReport): string {
  const chunks = report.chunks;
  const maxSize = Math.max(...chunks.map((c) => c.size), 1);

  const chunkRows = chunks
    .map((chunk: ChunkInfo) => {
      const widthPct = Math.max((chunk.size / maxSize) * 100, 1);
      const barColor = chunk.isInitial ? '#4a90d9' : '#66b0a0';
      return `
        <tr>
          <td class="name">${escapeHtml(chunk.name)}</td>
          <td class="bar-cell">
            <div class="bar" style="width: ${widthPct}%; background: ${barColor};"></div>
          </td>
          <td class="size">${formatBytes(chunk.size)}</td>
          <td class="size">${formatBytes(chunk.gzipSize)}</td>
          <td class="size">${formatBytes(chunk.brotliSize)}</td>
          <td class="type">${chunk.isInitial ? 'initial' : 'lazy'}</td>
          <td class="type">${chunk.isVendor ? 'vendor' : 'app'}</td>
        </tr>`;
    })
    .join('');

  const initialRawSaved =
    report.before.initial.raw > 0
      ? ((1 - report.after.initial.raw / report.before.initial.raw) * 100).toFixed(0)
      : '0';
  const initialGzipSaved =
    report.before.initial.gzip > 0
      ? ((1 - report.after.initial.gzip / report.before.initial.gzip) * 100).toFixed(0)
      : '0';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bundle Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; background: #f8f9fa; color: #333; }
    h1 { color: #2c3e50; }
    h2 { color: #34495e; margin-top: 32px; }
    .summary { display: flex; gap: 24px; margin: 20px 0; }
    .card { background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); flex: 1; }
    .card h3 { margin: 0 0 8px 0; font-size: 14px; color: #7f8c8d; text-transform: uppercase; }
    .card .value { font-size: 28px; font-weight: bold; color: #2c3e50; }
    .card .saved { font-size: 14px; color: #27ae60; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    th { text-align: left; padding: 12px 16px; background: #ecf0f1; font-size: 13px; color: #7f8c8d; text-transform: uppercase; }
    td { padding: 10px 16px; border-top: 1px solid #ecf0f1; font-size: 14px; }
    .name { font-family: 'SF Mono', Monaco, monospace; font-size: 13px; }
    .bar-cell { width: 300px; }
    .bar { height: 20px; border-radius: 3px; min-width: 2px; }
    .size { text-align: right; font-variant-numeric: tabular-nums; }
    .type { text-align: center; font-size: 12px; color: #95a5a6; }
    .rec { background: #fff3cd; padding: 12px 16px; border-radius: 6px; margin: 8px 0; font-size: 14px; }
  </style>
</head>
<body>
  <h1>Vite Bundle Optimizer Report</h1>

  <div class="summary">
    <div class="card">
      <h3>Initial JS (Before)</h3>
      <div class="value">${formatBytes(report.before.initial.raw)}</div>
      <div class="saved">gzip: ${formatBytes(report.before.initial.gzip)}</div>
    </div>
    <div class="card">
      <h3>Initial JS (After)</h3>
      <div class="value">${formatBytes(report.after.initial.raw)}</div>
      <div class="saved">gzip: ${formatBytes(report.after.initial.gzip)}</div>
    </div>
    <div class="card">
      <h3>Saved</h3>
      <div class="value">${initialRawSaved}%</div>
      <div class="saved">gzip: ${initialGzipSaved}%</div>
    </div>
    <div class="card">
      <h3>Chunks</h3>
      <div class="value">${report.after.chunks}</div>
      <div class="saved">initial chunks</div>
    </div>
  </div>

  <h2>Chunk Details</h2>
  <table>
    <thead>
      <tr>
        <th>Chunk</th>
        <th>Distribution</th>
        <th>Size</th>
        <th>Gzip</th>
        <th>Brotli</th>
        <th>Load</th>
        <th>Type</th>
      </tr>
    </thead>
    <tbody>
      ${chunkRows}
    </tbody>
  </table>

  ${
    report.recommendations.length > 0
      ? `<h2>Recommendations</h2>\n${report.recommendations.map((r) => `<div class="rec">${escapeHtml(r)}</div>`).join('')}`
      : ''
  }
</body>
</html>`;
}

/** Write the HTML report to a file. */
export function writeHtmlReport(report: BundleReport, outputPath: string): void {
  const filePath = resolve(outputPath);
  writeFileSync(filePath, generateHtmlReport(report), 'utf-8');
  console.log(`Bundle report written to ${filePath}`);
}
