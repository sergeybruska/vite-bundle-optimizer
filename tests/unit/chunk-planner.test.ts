import { describe, it, expect } from 'vitest';
import { computeChunkPlan } from '../../src/optimizer/chunk-planner.js';
import { buildModuleGraph } from '../../src/analyzer/module-graph.js';
import { computeStaticReachability } from '../../src/analyzer/dependency-graph.js';
import { resolveOptions } from '../../src/config/defaults.js';
import type { RollupModuleInfo, GetModuleInfo } from '../../src/analyzer/module-graph.js';

/** Build a mock getModuleInfo function from module definitions. */
function mockGetModuleInfo(
  modules: {
    id: string;
    code?: string;
    imports?: string[];
    dynamicImports?: string[];
    isEntry?: boolean;
  }[],
): GetModuleInfo {
  const map = new Map<string, RollupModuleInfo>();

  const importers = new Map<string, string[]>();
  const dynamicImporters = new Map<string, string[]>();

  for (const m of modules) {
    for (const imp of m.imports ?? []) {
      if (!importers.has(imp)) importers.set(imp, []);
      importers.get(imp)!.push(m.id);
    }
    for (const imp of m.dynamicImports ?? []) {
      if (!dynamicImporters.has(imp)) dynamicImporters.set(imp, []);
      dynamicImporters.get(imp)!.push(m.id);
    }
  }

  for (const m of modules) {
    map.set(
      m.id,
      {
        id: m.id,
        code: m.code ?? 'x'.repeat(100),
        importedIds: m.imports ?? [],
        dynamicallyImportedIds: m.dynamicImports ?? [],
        importers: importers.get(m.id) ?? [],
        dynamicImporters: dynamicImporters.get(m.id) ?? [],
        isEntry: m.isEntry ?? false,
        isExternal: false,
      } as unknown as RollupModuleInfo,
    );
  }

  return (id: string) => map.get(id) ?? null;
}

describe('computeChunkPlan', () => {
  it('groups vendor modules by ecosystem', () => {
    const modules = [
      {
        id: '/app/src/main.ts',
        isEntry: true,
        imports: ['/app/node_modules/react/index.js', '/app/src/App.tsx'],
      },
      { id: '/app/src/App.tsx', imports: ['/app/node_modules/react-dom/index.js'] },
      { id: '/app/node_modules/react/index.js' },
      { id: '/app/node_modules/react-dom/index.js' },
    ];

    const config = resolveOptions({ minChunkSize: 0 });
    const getModuleInfo = mockGetModuleInfo(modules);
    const moduleIds = modules.map((m) => m.id);
    const plan = computeChunkPlan(moduleIds, getModuleInfo, config);

    expect(plan.assignments.get('/app/node_modules/react/index.js')).toBe('vendor-react');
    expect(plan.assignments.get('/app/node_modules/react-dom/index.js')).toBe('vendor-react');
    expect(plan.assignments.get('/app/src/main.ts')).toBeUndefined();
    expect(plan.assignments.get('/app/src/App.tsx')).toBeUndefined();
  });

  it('separates initial and lazy vendor chunks', () => {
    const modules = [
      {
        id: '/app/src/main.ts',
        isEntry: true,
        imports: ['/app/src/App.tsx'],
        dynamicImports: ['/app/src/Editor.tsx'],
      },
      { id: '/app/src/App.tsx', imports: ['/app/node_modules/react/index.js'] },
      { id: '/app/src/Editor.tsx', imports: ['/app/node_modules/monaco-editor/index.js'] },
      { id: '/app/node_modules/react/index.js' },
      { id: '/app/node_modules/monaco-editor/index.js' },
    ];

    const config = resolveOptions({ minChunkSize: 0 });
    const getModuleInfo = mockGetModuleInfo(modules);
    const moduleIds = modules.map((m) => m.id);
    const plan = computeChunkPlan(moduleIds, getModuleInfo, config);

    expect(plan.assignments.get('/app/node_modules/react/index.js')).toBe('vendor-react');
    expect(plan.assignments.get('/app/node_modules/monaco-editor/index.js')).toBe(
      'vendor-editor-lazy',
    );
  });

  it('respects user-defined groups', () => {
    const modules = [
      {
        id: '/app/src/main.ts',
        isEntry: true,
        imports: ['/app/node_modules/monaco-editor/index.js'],
      },
      { id: '/app/node_modules/monaco-editor/index.js' },
    ];

    const config = resolveOptions({
      minChunkSize: 0,
      groups: { editor: ['monaco-editor', '@monaco-editor/*'] },
    });
    const getModuleInfo = mockGetModuleInfo(modules);
    const moduleIds = modules.map((m) => m.id);
    const plan = computeChunkPlan(moduleIds, getModuleInfo, config);

    expect(plan.assignments.get('/app/node_modules/monaco-editor/index.js')).toBe('editor');
  });

  it('excludes packages from optimization', () => {
    const modules = [
      {
        id: '/app/src/main.ts',
        isEntry: true,
        imports: ['/app/node_modules/react/index.js'],
      },
      { id: '/app/node_modules/react/index.js' },
    ];

    const config = resolveOptions({ minChunkSize: 0, exclude: ['react'] });
    const getModuleInfo = mockGetModuleInfo(modules);
    const moduleIds = modules.map((m) => m.id);
    const plan = computeChunkPlan(moduleIds, getModuleInfo, config);

    expect(plan.assignments.get('/app/node_modules/react/index.js')).toBeUndefined();
  });

  it('preserves packages from redistribution', () => {
    const modules = [
      {
        id: '/app/src/main.ts',
        isEntry: true,
        imports: ['/app/node_modules/react/index.js'],
      },
      { id: '/app/node_modules/react/index.js' },
    ];

    const config = resolveOptions({ minChunkSize: 0, preserve: ['react'] });
    const getModuleInfo = mockGetModuleInfo(modules);
    const moduleIds = modules.map((m) => m.id);
    const plan = computeChunkPlan(moduleIds, getModuleInfo, config);

    expect(plan.assignments.get('/app/node_modules/react/index.js')).toBeUndefined();
  });

  it('groups scoped packages correctly', () => {
    const modules = [
      {
        id: '/app/src/main.ts',
        isEntry: true,
        imports: ['/app/node_modules/@mui/material/index.js'],
      },
      {
        id: '/app/node_modules/@mui/material/index.js',
        imports: ['/app/node_modules/@emotion/react/index.js'],
      },
      { id: '/app/node_modules/@emotion/react/index.js' },
    ];

    const config = resolveOptions({ minChunkSize: 0 });
    const getModuleInfo = mockGetModuleInfo(modules);
    const moduleIds = modules.map((m) => m.id);
    const plan = computeChunkPlan(moduleIds, getModuleInfo, config);

    expect(plan.assignments.get('/app/node_modules/@mui/material/index.js')).toBe('vendor-ui');
    expect(plan.assignments.get('/app/node_modules/@emotion/react/index.js')).toBe('vendor-ui');
  });

  it('assigns unknown large packages to their own chunk', () => {
    const bigCode = 'x'.repeat(50_000);
    const modules = [
      {
        id: '/app/src/main.ts',
        isEntry: true,
        imports: ['/app/node_modules/some-big-lib/index.js'],
      },
      { id: '/app/node_modules/some-big-lib/index.js', code: bigCode },
    ];

    const config = resolveOptions({ minChunkSize: 30_000 });
    const getModuleInfo = mockGetModuleInfo(modules);
    const moduleIds = modules.map((m) => m.id);
    const plan = computeChunkPlan(moduleIds, getModuleInfo, config);

    expect(plan.assignments.get('/app/node_modules/some-big-lib/index.js')).toBe(
      'vendor-some-big-lib',
    );
  });

  it('assigns unknown small packages to general vendor chunk', () => {
    const smallCode = 'x'.repeat(1_000);
    const modules = [
      {
        id: '/app/src/main.ts',
        isEntry: true,
        imports: ['/app/node_modules/tiny-lib/index.js'],
      },
      { id: '/app/node_modules/tiny-lib/index.js', code: smallCode },
    ];

    const config = resolveOptions({ minChunkSize: 30_000 });
    const getModuleInfo = mockGetModuleInfo(modules);
    const moduleIds = modules.map((m) => m.id);
    const plan = computeChunkPlan(moduleIds, getModuleInfo, config);

    expect(plan.assignments.get('/app/node_modules/tiny-lib/index.js')).toBe('vendor');
  });

  it('detects shared dependencies across lazy chunks', () => {
    const sharedCode = 'x'.repeat(40_000);
    const modules = [
      {
        id: '/app/src/main.ts',
        isEntry: true,
        imports: [],
        dynamicImports: ['/app/src/PageA.tsx', '/app/src/PageB.tsx'],
      },
      { id: '/app/src/PageA.tsx', imports: ['/app/node_modules/lodash/index.js'] },
      { id: '/app/src/PageB.tsx', imports: ['/app/node_modules/lodash/index.js'] },
      { id: '/app/node_modules/lodash/index.js', code: sharedCode },
    ];

    const config = resolveOptions({ minChunkSize: 0, minSharedUsage: 2 });
    const getModuleInfo = mockGetModuleInfo(modules);
    const moduleIds = modules.map((m) => m.id);
    const plan = computeChunkPlan(moduleIds, getModuleInfo, config);

    const lodashChunk = plan.assignments.get('/app/node_modules/lodash/index.js');
    expect(lodashChunk).toBe('shared-vendor');
  });

  it('computes static reachability correctly', () => {
    const modules = [
      {
        id: '/app/src/main.ts',
        isEntry: true,
        imports: ['/app/src/App.tsx'],
        dynamicImports: ['/app/src/Lazy.tsx'],
      },
      { id: '/app/src/App.tsx', imports: ['/app/src/Util.ts'] },
      { id: '/app/src/Util.ts' },
      { id: '/app/src/Lazy.tsx', imports: ['/app/src/LazyUtil.ts'] },
      { id: '/app/src/LazyUtil.ts' },
    ];

    const getModuleInfo = mockGetModuleInfo(modules);
    const moduleIds = modules.map((m) => m.id);
    const graph = buildModuleGraph(moduleIds, getModuleInfo);
    const reachable = computeStaticReachability(graph, ['/app/src/main.ts']);

    expect(reachable.has('/app/src/main.ts')).toBe(true);
    expect(reachable.has('/app/src/App.tsx')).toBe(true);
    expect(reachable.has('/app/src/Util.ts')).toBe(true);
    expect(reachable.has('/app/src/Lazy.tsx')).toBe(false);
    expect(reachable.has('/app/src/LazyUtil.ts')).toBe(false);
  });

  it('merges small chunks below minChunkSize', () => {
    const smallCode = 'x'.repeat(5_000);
    const bigCode = 'x'.repeat(100_000);
    const modules = [
      {
        id: '/app/src/main.ts',
        isEntry: true,
        imports: [
          '/app/node_modules/react/index.js',
          '/app/node_modules/lodash/index.js',
          '/app/node_modules/big-lib/index.js',
        ],
      },
      { id: '/app/node_modules/react/index.js', code: smallCode },
      { id: '/app/node_modules/lodash/index.js', code: smallCode },
      { id: '/app/node_modules/big-lib/index.js', code: bigCode },
    ];

    const config = resolveOptions({ minChunkSize: 30_000 });
    const getModuleInfo = mockGetModuleInfo(modules);
    const moduleIds = modules.map((m) => m.id);
    const plan = computeChunkPlan(moduleIds, getModuleInfo, config);

    const reactChunk = plan.assignments.get('/app/node_modules/react/index.js');
    const lodashChunk = plan.assignments.get('/app/node_modules/lodash/index.js');
    expect(reactChunk).toBeDefined();
    expect(lodashChunk).toBeDefined();
    // Both small chunks should be merged into the same target
    expect(reactChunk).toBe(lodashChunk);
  });

  it('handles pnpm-style paths', () => {
    const modules = [
      {
        id: '/app/src/main.ts',
        isEntry: true,
        imports: ['/app/node_modules/.pnpm/react@18.0.0/node_modules/react/index.js'],
      },
      { id: '/app/node_modules/.pnpm/react@18.0.0/node_modules/react/index.js' },
    ];

    const config = resolveOptions({ minChunkSize: 0 });
    const getModuleInfo = mockGetModuleInfo(modules);
    const moduleIds = modules.map((m) => m.id);
    const plan = computeChunkPlan(moduleIds, getModuleInfo, config);

    expect(
      plan.assignments.get('/app/node_modules/.pnpm/react@18.0.0/node_modules/react/index.js'),
    ).toBe('vendor-react');
  });

  it('merges chunks with circular dependencies', () => {
    // Circular dependency: react ↔ zustand
    const modules = [
      {
        id: '/app/src/main.ts',
        isEntry: true,
        imports: ['/app/node_modules/react/index.js', '/app/node_modules/zustand/index.js'],
      },
      {
        id: '/app/node_modules/react/index.js',
        imports: ['/app/node_modules/zustand/index.js'], // circular
      },
      {
        id: '/app/node_modules/zustand/index.js',
        imports: ['/app/node_modules/react/index.js'], // circular
      },
    ];

    const config = resolveOptions({ minChunkSize: 0 });
    const getModuleInfo = mockGetModuleInfo(modules);
    const moduleIds = modules.map((m) => m.id);
    const plan = computeChunkPlan(moduleIds, getModuleInfo, config);

    // react and zustand should be in the SAME chunk (circular dep merged)
    const reactChunk = plan.assignments.get('/app/node_modules/react/index.js');
    const zustandChunk = plan.assignments.get('/app/node_modules/zustand/index.js');
    expect(reactChunk).toBeDefined();
    expect(zustandChunk).toBeDefined();
    expect(reactChunk).toBe(zustandChunk);
  });

  it('groups vue vendor modules by ecosystem', () => {
    const modules = [
      {
        id: '/app/src/main.ts',
        isEntry: true,
        imports: ['/app/node_modules/vue/index.js', '/app/src/App.vue'],
      },
      { id: '/app/src/App.vue', imports: ['/app/node_modules/pinia/index.js'] },
      { id: '/app/node_modules/vue/index.js' },
      { id: '/app/node_modules/pinia/index.js' },
    ];

    const config = resolveOptions({ minChunkSize: 0 });
    const getModuleInfo = mockGetModuleInfo(modules);
    const moduleIds = modules.map((m) => m.id);
    const plan = computeChunkPlan(moduleIds, getModuleInfo, config);

    expect(plan.assignments.get('/app/node_modules/vue/index.js')).toBe('vendor-vue');
    expect(plan.assignments.get('/app/node_modules/pinia/index.js')).toBe('vendor-vue');
  });

  it('groups svelte vendor modules by ecosystem', () => {
    const modules = [
      {
        id: '/app/src/main.ts',
        isEntry: true,
        imports: [
          '/app/node_modules/svelte/index.js',
          '/app/node_modules/svelte-preprocess/index.js',
        ],
      },
      { id: '/app/node_modules/svelte/index.js' },
      { id: '/app/node_modules/svelte-preprocess/index.js' },
    ];

    const config = resolveOptions({ minChunkSize: 0 });
    const getModuleInfo = mockGetModuleInfo(modules);
    const moduleIds = modules.map((m) => m.id);
    const plan = computeChunkPlan(moduleIds, getModuleInfo, config);

    expect(plan.assignments.get('/app/node_modules/svelte/index.js')).toBe('vendor-svelte');
    expect(plan.assignments.get('/app/node_modules/svelte-preprocess/index.js')).toBe(
      'vendor-svelte',
    );
  });

  it('groups solid vendor modules by ecosystem', () => {
    const modules = [
      {
        id: '/app/src/main.ts',
        isEntry: true,
        imports: ['/app/node_modules/solid-js/index.js'],
      },
      { id: '/app/node_modules/solid-js/index.js' },
    ];

    const config = resolveOptions({ minChunkSize: 0 });
    const getModuleInfo = mockGetModuleInfo(modules);
    const moduleIds = modules.map((m) => m.id);
    const plan = computeChunkPlan(moduleIds, getModuleInfo, config);

    expect(plan.assignments.get('/app/node_modules/solid-js/index.js')).toBe('vendor-solid');
  });

  it('groups preact vendor modules by ecosystem', () => {
    const modules = [
      {
        id: '/app/src/main.ts',
        isEntry: true,
        imports: ['/app/node_modules/preact/index.js'],
      },
      { id: '/app/node_modules/preact/index.js' },
    ];

    const config = resolveOptions({ minChunkSize: 0 });
    const getModuleInfo = mockGetModuleInfo(modules);
    const moduleIds = modules.map((m) => m.id);
    const plan = computeChunkPlan(moduleIds, getModuleInfo, config);

    expect(plan.assignments.get('/app/node_modules/preact/index.js')).toBe('vendor-preact');
  });

  it('groups angular vendor modules by ecosystem', () => {
    const modules = [
      {
        id: '/app/src/main.ts',
        isEntry: true,
        imports: ['/app/node_modules/@angular/core/index.js'],
      },
      { id: '/app/node_modules/@angular/core/index.js' },
    ];

    const config = resolveOptions({ minChunkSize: 0 });
    const getModuleInfo = mockGetModuleInfo(modules);
    const moduleIds = modules.map((m) => m.id);
    const plan = computeChunkPlan(moduleIds, getModuleInfo, config);

    expect(plan.assignments.get('/app/node_modules/@angular/core/index.js')).toBe(
      'vendor-angular',
    );
  });

  it('pulls vue-dependent initial packages into vendor-vue chunk', () => {
    // A UI library in the 'ui' group that depends on vue runtime at init time
    // should be pulled into vendor-vue to avoid TDZ errors.
    const modules = [
      {
        id: '/app/src/main.ts',
        isEntry: true,
        imports: [
          '/app/node_modules/vue/index.js',
          '/app/node_modules/@headlessui/vue/index.js',
        ],
      },
      {
        id: '/app/node_modules/@headlessui/vue/index.js',
        imports: ['/app/node_modules/vue/index.js'],
      },
      { id: '/app/node_modules/vue/index.js' },
    ];

    const config = resolveOptions({ minChunkSize: 0 });
    const getModuleInfo = mockGetModuleInfo(modules);
    const moduleIds = modules.map((m) => m.id);
    const plan = computeChunkPlan(moduleIds, getModuleInfo, config);

    // @headlessui/vue matches the 'ui' group, but depends on vue runtime,
    // so it should be pulled into vendor-vue (not vendor-ui)
    expect(plan.assignments.get('/app/node_modules/vue/index.js')).toBe('vendor-vue');
    expect(plan.assignments.get('/app/node_modules/@headlessui/vue/index.js')).toBe('vendor-vue');
  });

  it('pulls svelte-dependent initial packages into vendor-svelte chunk', () => {
    // A library depending on svelte runtime at init time should be pulled
    // into vendor-svelte to avoid TDZ errors.
    const modules = [
      {
        id: '/app/src/main.ts',
        isEntry: true,
        imports: [
          '/app/node_modules/svelte/index.js',
          '/app/node_modules/svelte-spa-router/index.js',
        ],
      },
      {
        id: '/app/node_modules/svelte-spa-router/index.js',
        imports: ['/app/node_modules/svelte/index.js'],
      },
      { id: '/app/node_modules/svelte/index.js' },
    ];

    const config = resolveOptions({ minChunkSize: 0 });
    const getModuleInfo = mockGetModuleInfo(modules);
    const moduleIds = modules.map((m) => m.id);
    const plan = computeChunkPlan(moduleIds, getModuleInfo, config);

    expect(plan.assignments.get('/app/node_modules/svelte/index.js')).toBe('vendor-svelte');
    expect(plan.assignments.get('/app/node_modules/svelte-spa-router/index.js')).toBe(
      'vendor-svelte',
    );
  });

  it('supports custom runtime packages via config', () => {
    // User adds a custom framework runtime; a vendor-grouped package that
    // depends on it should be pulled into the custom runtime's chunk.
    const modules = [
      {
        id: '/app/src/main.ts',
        isEntry: true,
        imports: [
          '/app/node_modules/my-framework/index.js',
          '/app/node_modules/@mui/material/index.js',
        ],
      },
      {
        id: '/app/node_modules/@mui/material/index.js',
        imports: ['/app/node_modules/my-framework/index.js'],
      },
      { id: '/app/node_modules/my-framework/index.js' },
    ];

    const config = resolveOptions({
      minChunkSize: 0,
      runtimePackages: { myframework: ['my-framework'] },
    });
    const getModuleInfo = mockGetModuleInfo(modules);
    const moduleIds = modules.map((m) => m.id);
    const plan = computeChunkPlan(moduleIds, getModuleInfo, config);

    // @mui/material is in the 'ui' group but depends on my-framework runtime,
    // so it should be pulled into vendor-myframework (not vendor-ui)
    expect(plan.assignments.get('/app/node_modules/my-framework/index.js')).toBe(
      'vendor-my-framework',
    );
    expect(plan.assignments.get('/app/node_modules/@mui/material/index.js')).toBe(
      'vendor-myframework',
    );
  });

  it('does not pull lazy runtime-dependent packages into runtime chunk', () => {
    // Lazy packages should keep their own group's lazy chunk, not be pulled
    // into the runtime chunk (runtime is already loaded by then).
    const modules = [
      {
        id: '/app/src/main.ts',
        isEntry: true,
        imports: ['/app/node_modules/vue/index.js'],
        dynamicImports: ['/app/src/LazyPage.vue'],
      },
      {
        id: '/app/src/LazyPage.vue',
        imports: ['/app/node_modules/@headlessui/vue/index.js'],
      },
      {
        id: '/app/node_modules/@headlessui/vue/index.js',
        imports: ['/app/node_modules/vue/index.js'],
      },
      { id: '/app/node_modules/vue/index.js' },
    ];

    const config = resolveOptions({ minChunkSize: 0 });
    const getModuleInfo = mockGetModuleInfo(modules);
    const moduleIds = modules.map((m) => m.id);
    const plan = computeChunkPlan(moduleIds, getModuleInfo, config);

    expect(plan.assignments.get('/app/node_modules/vue/index.js')).toBe('vendor-vue');
    // @headlessui/vue is lazy (only reachable via dynamic import), so it stays
    // in vendor-ui-lazy, not pulled into vendor-vue
    expect(plan.assignments.get('/app/node_modules/@headlessui/vue/index.js')).toBe(
      'vendor-ui-lazy',
    );
  });
});
