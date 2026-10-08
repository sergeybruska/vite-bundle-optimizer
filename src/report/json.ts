import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BundleReport } from '../types/index.js';

/** Write the bundle report as a JSON file. */
export function writeJsonReport(report: BundleReport, outputPath: string): void {
  const filePath = resolve(outputPath);
  writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`Bundle report written to ${filePath}`);
}

/** Serialize the bundle report as a JSON string. */
export function serializeJsonReport(report: BundleReport): string {
  return JSON.stringify(report, null, 2);
}
