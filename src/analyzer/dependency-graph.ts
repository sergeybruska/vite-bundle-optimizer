import type { ModuleInfoExtended } from '../types/index.js';

/** Modules reachable from entries via static imports only (the "initial bundle"). BFS, O(V+E). */
export function computeStaticReachability(
  graph: Map<string, ModuleInfoExtended>,
  entryIds: string[],
): Set<string> {
  const reachable = new Set<string>();
  const queue: string[] = [];

  for (const entry of entryIds) {
    if (graph.has(entry) && !reachable.has(entry)) {
      reachable.add(entry);
      queue.push(entry);
    }
  }

  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) break;
    const node = graph.get(id);
    if (!node) continue;

    for (const imp of node.imports) {
      if (!reachable.has(imp) && graph.has(imp)) {
        reachable.add(imp);
        queue.push(imp);
      }
    }
  }

  return reachable;
}

/** Modules reachable via dynamic imports only (lazy-loadable code). BFS, O(V+E). */
export function computeDynamicReachability(
  graph: Map<string, ModuleInfoExtended>,
): Set<string> {
  const dynamic = new Set<string>();
  const queue: string[] = [];

  // Start from modules that have dynamic imports
  for (const node of graph.values()) {
    for (const dyn of node.dynamicImports) {
      if (!dynamic.has(dyn) && graph.has(dyn)) {
        dynamic.add(dyn);
        queue.push(dyn);
      }
    }
  }

  // Follow static imports from dynamically-imported modules
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) break;
    const node = graph.get(id);
    if (!node) continue;

    for (const imp of node.imports) {
      if (!dynamic.has(imp) && graph.has(imp)) {
        dynamic.add(imp);
        queue.push(imp);
      }
    }
  }

  return dynamic;
}

/** Whether a module is in the initial bundle (statically reachable from entries). */
export function isInitialModule(
  id: string,
  staticReachable: Set<string>,
): boolean {
  return staticReachable.has(id);
}

/** Count distinct chunks importing a module (for shared dependency detection). */
export function countImporterChunks(
  moduleId: string,
  graph: Map<string, ModuleInfoExtended>,
  assignments: Map<string, string>,
): Set<string> {
  const node = graph.get(moduleId);
  if (!node) return new Set();

  const chunks = new Set<string>();
  for (const importer of node.importedBy) {
    const chunk = assignments.get(importer);
    if (chunk) {
      chunks.add(chunk);
    } else if (graph.has(importer)) {
      chunks.add(`__app__${importer}`); // placeholder to detect cross-chunk sharing
    }
  }
  return chunks;
}

export function computeModulesSize(
  ids: Iterable<string>,
  graph: Map<string, ModuleInfoExtended>,
): number {
  let total = 0;
  for (const id of ids) {
    const node = graph.get(id);
    if (node) total += node.size;
  }
  return total;
}
