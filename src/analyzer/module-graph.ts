import type { ModuleInfoExtended } from '../types/index.js';
import { extractPackageName, isNodeModule } from './package-analyzer.js';
import type { ModuleInfo, GetModuleInfo as RollupGetModuleInfo } from 'rollup';

export type RollupModuleInfo = ModuleInfo;

export type GetModuleInfo = RollupGetModuleInfo;

/** Build ModuleInfoExtended from module IDs, estimating size from code length. */
export function buildModuleGraph(
  moduleIds: Iterable<string>,
  getModuleInfo: GetModuleInfo,
): Map<string, ModuleInfoExtended> {
  const graph = new Map<string, ModuleInfoExtended>();

  for (const id of moduleIds) {
    const info = getModuleInfo(id);
    if (!info || info.isExternal) continue;

    const nodeModule = isNodeModule(id);
    const packageName = nodeModule ? extractPackageName(id) : undefined;
    const size = info.code ? info.code.length : 0;

    graph.set(id, {
      id,
      packageName,
      size,
      importedBy: [...info.importers],
      imports: [...info.importedIds],
      dynamicImporters: [...info.dynamicImporters],
      dynamicImports: [...info.dynamicallyImportedIds],
      isNodeModule: nodeModule,
      isEntry: info.isEntry,
      isExternal: info.isExternal,
    });
  }

  // Ensure all referenced modules exist in the graph (some may not be in moduleIds)
  const allIds = new Set<string>(graph.keys());
  for (const node of graph.values()) {
    for (const imp of node.imports) allIds.add(imp);
    for (const imp of node.dynamicImports) allIds.add(imp);
    for (const imp of node.importedBy) allIds.add(imp);
    for (const imp of node.dynamicImporters) allIds.add(imp);
  }

  for (const id of allIds) {
    if (graph.has(id)) continue;
    const info = getModuleInfo(id);
    if (!info || info.isExternal) continue;

    const nodeModule = isNodeModule(id);
    const packageName = nodeModule ? extractPackageName(id) : undefined;
    const size = info.code ? info.code.length : 0;

    graph.set(id, {
      id,
      packageName,
      size,
      importedBy: [...info.importers],
      imports: [...info.importedIds],
      dynamicImporters: [...info.dynamicImporters],
      dynamicImports: [...info.dynamicallyImportedIds],
      isNodeModule: nodeModule,
      isEntry: info.isEntry,
      isExternal: info.isExternal,
    });
  }

  return graph;
}

export function getEntryIds(graph: Map<string, ModuleInfoExtended>): string[] {
  const entries: string[] = [];
  for (const node of graph.values()) {
    if (node.isEntry) entries.push(node.id);
  }
  return entries;
}
