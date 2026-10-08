import type { ModuleInfoExtended, ResolvedConfig } from '../types/index.js';
import type { GetModuleInfo } from '../analyzer/module-graph.js';
import { buildModuleGraph, getEntryIds } from '../analyzer/module-graph.js';
import { computeStaticReachability } from '../analyzer/dependency-graph.js';
import { matchAnyPattern } from '../analyzer/package-analyzer.js';
import { findVendorGroup, findUserGroup } from './vendor-groups.js';
import { detectSharedDependencies } from './shared-dependencies.js';

/** Chunk plan: module ID → chunk name (undefined = let Rollup decide). */
export interface ChunkPlan {
  assignments: Map<string, string | undefined>;
  /** chunkName → set of module IDs */
  chunks: Map<string, Set<string>>;
  /** initial (statically reachable) module IDs */
  initialModules: Set<string>;
}

/**
 * Compute the chunk plan by analyzing the module graph:
 * 1. Build module graph; 2. Static reachability (initial vs lazy);
 * 3. Apply user groups/exclude/preserve; 4. Group vendor by ecosystem;
 * 5. Detect shared deps; 6. Resolve circular chunks; 7-8. Size/maxChunks limits.
 */
export function computeChunkPlan(
  moduleIds: Iterable<string>,
  getModuleInfo: GetModuleInfo,
  config: ResolvedConfig,
): ChunkPlan {
  const graph = buildModuleGraph(moduleIds, getModuleInfo);
  const entryIds = getEntryIds(graph);
  const initialModules = computeStaticReachability(graph, entryIds);

  const assignments = new Map<string, string | undefined>();
  const excludeSet = new Set<string>();

  // Step 1: Excluded packages (left to Rollup's default)
  for (const node of graph.values()) {
    if (!node.isNodeModule || !node.packageName) continue;
    if (matchAnyPattern(node.packageName, config.exclude)) {
      excludeSet.add(node.id);
      assignments.set(node.id, undefined);
    }
  }

  // Step 2: Preserved packages (left to Rollup's default)
  for (const node of graph.values()) {
    if (!node.isNodeModule || !node.packageName) continue;
    if (config.preserve.includes(node.packageName)) {
      assignments.set(node.id, undefined);
    }
  }

  // Step 3: User-defined explicit groups
  for (const node of graph.values()) {
    if (!node.isNodeModule || !node.packageName) continue;
    if (excludeSet.has(node.id)) continue;
    if (assignments.has(node.id)) continue; // already handled (preserve)

    const userGroup = findUserGroup(node.packageName, config.groups);
    if (userGroup) {
      const isInitial = initialModules.has(node.id);
      const chunkName = isInitial ? userGroup : `${userGroup}-lazy`;
      assignments.set(node.id, chunkName);
    }
  }

  // Step 4: Group remaining vendor modules by ecosystem
  const groupSizes = new Map<string, number>();

  // Packages depending on a framework runtime must be in that runtime's chunk
  // to avoid init order issues (react.ForwardRef, vue reactivity APIs,
  // svelte/internal, solid-js primitives, etc. are accessed at module init time).
  const runtimeDependentPackages = findRuntimeDependentPackages(graph, config.runtimePackages);

  for (const node of graph.values()) {
    if (!node.isNodeModule || !node.packageName) continue;
    if (excludeSet.has(node.id)) continue;
    if (assignments.has(node.id)) continue; // already assigned

    const vendorGroup = findVendorGroup(node.packageName);
    const isInitial = initialModules.has(node.id);

    let chunkName: string;
    if (vendorGroup) {
      // Initial runtime-dependent packages go in the runtime's chunk to avoid
      // init order issues, unless they already belong to that runtime's group.
      const runtimeChunk = runtimeDependentPackages.get(node.packageName);
      if (isInitial && runtimeChunk && `vendor-${vendorGroup}` !== runtimeChunk) {
        chunkName = runtimeChunk;
      } else {
        chunkName = isInitial ? `vendor-${vendorGroup}` : `vendor-${vendorGroup}-lazy`;
      }
    } else {
      // Large packages get their own chunk; small ones go to general vendor
      const packageSize = computePackageSize(node.packageName, graph);
      if (packageSize >= config.minChunkSize) {
        const safeName = sanitizeChunkName(node.packageName);
        chunkName = isInitial ? `vendor-${safeName}` : `vendor-${safeName}-lazy`;
      } else {
        chunkName = isInitial ? 'vendor' : 'vendor-lazy';
      }
    }

    assignments.set(node.id, chunkName);
    groupSizes.set(chunkName, (groupSizes.get(chunkName) ?? 0) + node.size);
  }

  // Step 5: Detect shared dependencies across lazy chunks
  const sharedDeps = detectSharedDependencies(
    graph,
    assignments as Map<string, string>,
    initialModules,
    config.minSharedUsage,
  );

  for (const id of sharedDeps) {
    assignments.set(id, 'shared-vendor');
  }

  // Step 6: Resolve circular dependencies between chunks
  resolveCircularChunks(assignments, groupSizes, graph);

  // Step 7: Apply size limits
  applySizeLimits(assignments, groupSizes, graph, config);

  // Step 8: Enforce maxChunks
  enforceMaxChunks(assignments, groupSizes, graph, config);

  // Build chunk → modules map
  const chunks = new Map<string, Set<string>>();
  for (const [moduleId, chunkName] of assignments) {
    if (chunkName === undefined) continue;
    let set = chunks.get(chunkName);
    if (!set) {
      set = new Set();
      chunks.set(chunkName, set);
    }
    set.add(moduleId);
  }

  return { assignments, chunks, initialModules };
}

/** Total size of all modules belonging to a package. */
function computePackageSize(
  packageName: string,
  graph: Map<string, ModuleInfoExtended>,
): number {
  let total = 0;
  for (const node of graph.values()) {
    if (node.packageName === packageName) {
      total += node.size;
    }
  }
  return total;
}

/**
 * Find packages that transitively depend on a framework runtime via reverse
 * BFS. These must be in the runtime's chunk to avoid "Cannot access X before
 * initialization" (TDZ) errors — components access runtime APIs (react.ForwardRef,
 * vue reactivity, svelte/internal, solid-js primitives, etc.) at module init
 * time. Returns a map of package name → target chunk name (e.g. 'vendor-react').
 * The first matching framework wins (preserves react priority). O(V+E) total.
 */
function findRuntimeDependentPackages(
  graph: Map<string, ModuleInfoExtended>,
  runtimePackages: Record<string, string[]>,
): Map<string, string> {
  const result = new Map<string, string>();

  // Build reverse adjacency once (who imports each module)
  const reverseDeps = new Map<string, Set<string>>();
  for (const node of graph.values()) {
    for (const imp of node.imports) {
      let importers = reverseDeps.get(imp);
      if (!importers) {
        importers = new Set();
        reverseDeps.set(imp, importers);
      }
      importers.add(node.id);
    }
  }

  for (const [framework, packages] of Object.entries(runtimePackages)) {
    const runtimeSet = new Set(packages);
    const runtimeModules = new Set<string>();
    for (const node of graph.values()) {
      if (!node.packageName) continue;
      if (runtimeSet.has(node.packageName)) {
        runtimeModules.add(node.id);
      }
    }

    if (runtimeModules.size === 0) continue;

    const dependentModules = new Set<string>(runtimeModules);
    const queue: string[] = [...runtimeModules];

    while (queue.length > 0) {
      const id = queue.shift();
      if (id === undefined) break;
      const importers = reverseDeps.get(id);
      if (!importers) continue;

      for (const importer of importers) {
        if (!dependentModules.has(importer) && graph.has(importer)) {
          dependentModules.add(importer);
          queue.push(importer);
        }
      }
    }

    const chunkName = `vendor-${framework}`;
    for (const id of dependentModules) {
      const node = graph.get(id);
      if (!node?.packageName) continue;
      if (runtimeSet.has(node.packageName)) continue; // runtime packages stay in their own group
      // First framework wins (preserves react priority for shared deps)
      if (!result.has(node.packageName)) {
        result.set(node.packageName, chunkName);
      }
    }
  }

  return result;
}

/** Sanitize a package name for use in a chunk name. */
function sanitizeChunkName(name: string): string {
  return name
    .replace(/[@/]/g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .replace(/^-+|-+$/g, '');
}

/** Merge chunks below minChunkSize into larger same-category chunks. */
function applySizeLimits(
  assignments: Map<string, string | undefined>,
  groupSizes: Map<string, number>,
  graph: Map<string, ModuleInfoExtended>,
  config: ResolvedConfig,
): void {
  const smallChunks: { name: string; size: number; isInitial: boolean }[] = [];

  for (const [name, size] of groupSizes) {
    if (size < config.minChunkSize) {
      smallChunks.push({
        name,
        size,
        isInitial: !name.endsWith('-lazy') && !name.endsWith('-shared'),
      });
    }
  }

  smallChunks.sort((a, b) => a.size - b.size); // smallest first

  for (const { name, isInitial } of smallChunks) {
    // Prefer merging into a same-category (initial/lazy) chunk
    let target: string | undefined;
    let targetSize = 0;

    for (const [otherName, otherSize] of groupSizes) {
      if (otherName === name) continue;
      const otherIsInitial = !otherName.endsWith('-lazy') && !otherName.endsWith('-shared');
      if (otherIsInitial !== isInitial) continue;
      if (otherSize < config.minChunkSize) continue; // don't merge into another small chunk
      if (!target || otherSize < targetSize) {
        target = otherName;
        targetSize = otherSize;
      }
    }

    if (!target) {
      target = isInitial ? 'vendor' : 'vendor-lazy';
    }

    for (const [moduleId, chunkName] of assignments) {
      if (chunkName === name) {
        assignments.set(moduleId, target);
      }
    }

    const mergedSize = groupSizes.get(name) ?? 0;
    groupSizes.set(target, (groupSizes.get(target) ?? 0) + mergedSize);
    groupSizes.delete(name);
  }
}

/** Enforce maxChunks by merging the smallest same-category chunks. */
function enforceMaxChunks(
  assignments: Map<string, string | undefined>,
  groupSizes: Map<string, number>,
  graph: Map<string, ModuleInfoExtended>,
  config: ResolvedConfig,
): void {
  while (groupSizes.size > config.maxChunks) {
    const sorted = [...groupSizes.entries()].sort((a, b) => a[1] - b[1]);

    let merged = false;
    for (let i = 0; i < sorted.length && !merged; i++) {
      for (let j = i + 1; j < sorted.length && !merged; j++) {
        const [nameA] = sorted[i];
        const [nameB] = sorted[j];
        const aIsInitial = !nameA.endsWith('-lazy') && !nameA.endsWith('-shared');
        const bIsInitial = !nameB.endsWith('-lazy') && !nameB.endsWith('-shared');

        if (aIsInitial === bIsInitial) {
          const target = nameA; // A is smaller
          const source = nameB;

          for (const [moduleId, chunkName] of assignments) {
            if (chunkName === source) {
              assignments.set(moduleId, target);
            }
          }

          groupSizes.set(target, (groupSizes.get(target) ?? 0) + (groupSizes.get(source) ?? 0));
          groupSizes.delete(source);
          merged = true;
        }
      }
    }

    if (!merged) break; // all different categories
  }
}

/**
 * Merge chunks with circular dependencies to avoid "Cannot access X before
 * initialization" errors. Uses Tarjan's SCC algorithm: chunks in each SCC
 * (size > 1) are merged into one, letting Rollup handle init order internally.
 */
function resolveCircularChunks(
  assignments: Map<string, string | undefined>,
  groupSizes: Map<string, number>,
  graph: Map<string, ModuleInfoExtended>,
): void {
  const chunkDeps = new Map<string, Set<string>>();

  for (const node of graph.values()) {
    const sourceChunk = assignments.get(node.id);
    if (!sourceChunk) continue;

    let deps = chunkDeps.get(sourceChunk);
    if (!deps) {
      deps = new Set();
      chunkDeps.set(sourceChunk, deps);
    }

    for (const imp of node.imports) {
      const targetChunk = assignments.get(imp);
      if (targetChunk && targetChunk !== sourceChunk) {
        deps.add(targetChunk);
      }
    }
    for (const imp of node.dynamicImports) {
      const targetChunk = assignments.get(imp);
      if (targetChunk && targetChunk !== sourceChunk) {
        deps.add(targetChunk);
      }
    }
  }

  // Find SCCs using Tarjan's algorithm
  const sccs = findStronglyConnectedComponents(chunkDeps);

  for (const scc of sccs) {
    if (scc.size <= 1) continue;

    // Pick the largest chunk as merge target
    let target = '';
    let targetSize = -1;
    for (const chunk of scc) {
      const size = groupSizes.get(chunk) ?? 0;
      if (size > targetSize) {
        targetSize = size;
        target = chunk;
      }
    }

    // Merge other chunks into the target
    for (const chunk of scc) {
      if (chunk === target) continue;

      for (const [moduleId, chunkName] of assignments) {
        if (chunkName === chunk) {
          assignments.set(moduleId, target);
        }
      }

      groupSizes.set(target, (groupSizes.get(target) ?? 0) + (groupSizes.get(chunk) ?? 0));
      groupSizes.delete(chunk);
    }
  }
}

/** Find strongly connected components using Tarjan's algorithm. O(V+E). */
function findStronglyConnectedComponents(graph: Map<string, Set<string>>): Set<string>[] {
  const indexMap = new Map<string, number>();
  const lowLinkMap = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: Set<string>[] = [];
  let index = 0;

  function strongconnect(v: string): void {
    indexMap.set(v, index);
    lowLinkMap.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    const neighbors = graph.get(v) ?? new Set();
    for (const w of neighbors) {
      if (!indexMap.has(w)) {
        strongconnect(w);
        const vLow = lowLinkMap.get(v) ?? 0;
        const wLow = lowLinkMap.get(w) ?? 0;
        lowLinkMap.set(v, Math.min(vLow, wLow));
      } else if (onStack.has(w)) {
        const vLow = lowLinkMap.get(v) ?? 0;
        const wIdx = indexMap.get(w) ?? 0;
        lowLinkMap.set(v, Math.min(vLow, wIdx));
      }
    }

    // If v is a root node, pop the SCC
    if (lowLinkMap.get(v) === indexMap.get(v)) {
      const scc = new Set<string>();
      let w: string | undefined;
      do {
        w = stack.pop();
        if (w === undefined) break;
        onStack.delete(w);
        scc.add(w);
      } while (w !== v);
      sccs.push(scc);
    }
  }

  for (const v of graph.keys()) {
    if (!indexMap.has(v)) {
      strongconnect(v);
    }
  }

  return sccs;
}
