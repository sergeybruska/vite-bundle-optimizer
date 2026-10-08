import type { ModuleInfoExtended } from '../types/index.js';

/** Detect lazy vendor modules imported by >= minSharedUsage distinct lazy modules. */
export function detectSharedDependencies(
  graph: Map<string, ModuleInfoExtended>,
  _assignments: Map<string, string>,
  initialModules: Set<string>,
  minSharedUsage: number,
): Set<string> {
  const shared = new Set<string>();

  for (const node of graph.values()) {
    if (!node.isNodeModule) continue; // only vendor modules
    if (initialModules.has(node.id)) continue; // only lazy

    const lazyImporters = new Set<string>();
    for (const importer of node.importedBy) {
      if (!initialModules.has(importer) && graph.has(importer)) {
        lazyImporters.add(importer);
      }
    }

    if (lazyImporters.size >= minSharedUsage) {
      shared.add(node.id);
    }
  }

  return shared;
}
