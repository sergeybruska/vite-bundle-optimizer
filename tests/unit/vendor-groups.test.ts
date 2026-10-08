import { describe, it, expect } from 'vitest';
import {
  findVendorGroup,
  findUserGroup,
  RUNTIME_PACKAGES,
  mergeRuntimePackages,
} from '../../src/optimizer/vendor-groups.js';

describe('findVendorGroup', () => {
  it('identifies react ecosystem packages', () => {
    expect(findVendorGroup('react')).toBe('react');
    expect(findVendorGroup('react-dom')).toBe('react');
    expect(findVendorGroup('scheduler')).toBe('react');
    expect(findVendorGroup('react-is')).toBe('react');
    expect(findVendorGroup('react-jsx-runtime')).toBe('react');
  });

  it('identifies UI library packages', () => {
    expect(findVendorGroup('@mui/material')).toBe('ui');
    expect(findVendorGroup('@emotion/react')).toBe('ui');
    expect(findVendorGroup('@radix-ui/react-dialog')).toBe('ui');
    expect(findVendorGroup('antd')).toBe('ui');
  });

  it('identifies chart packages', () => {
    expect(findVendorGroup('chart.js')).toBe('charts');
    expect(findVendorGroup('recharts')).toBe('charts');
    expect(findVendorGroup('d3-scale')).toBe('charts');
    expect(findVendorGroup('echarts')).toBe('charts');
  });

  it('identifies editor packages', () => {
    expect(findVendorGroup('monaco-editor')).toBe('editor');
    expect(findVendorGroup('@monaco-editor/react')).toBe('editor');
    expect(findVendorGroup('@codemirror/state')).toBe('editor');
  });

  it('identifies state management packages', () => {
    expect(findVendorGroup('zustand')).toBe('state');
    expect(findVendorGroup('redux')).toBe('state');
    expect(findVendorGroup('@reduxjs/toolkit')).toBe('state');
    expect(findVendorGroup('jotai')).toBe('state');
  });

  it('identifies utility packages', () => {
    expect(findVendorGroup('lodash')).toBe('utils');
    expect(findVendorGroup('lodash-es')).toBe('utils');
    expect(findVendorGroup('date-fns')).toBe('utils');
    expect(findVendorGroup('dayjs')).toBe('utils');
    expect(findVendorGroup('tslib')).toBe('utils');
  });

  it('identifies icon packages', () => {
    expect(findVendorGroup('lucide-react')).toBe('icons');
    expect(findVendorGroup('react-icons')).toBe('icons');
    expect(findVendorGroup('@heroicons/react')).toBe('icons');
  });

  it('returns undefined for unknown packages', () => {
    expect(findVendorGroup('some-unknown-package')).toBeUndefined();
    expect(findVendorGroup('@my-scope/my-package')).toBeUndefined();
  });

  it('identifies vue ecosystem packages', () => {
    expect(findVendorGroup('vue')).toBe('vue');
    expect(findVendorGroup('@vue/runtime-core')).toBe('vue');
    expect(findVendorGroup('@vue/runtime-dom')).toBe('vue');
    expect(findVendorGroup('@vue/reactivity')).toBe('vue');
    expect(findVendorGroup('vue-router')).toBe('router');
    expect(findVendorGroup('pinia')).toBe('vue');
    expect(findVendorGroup('@vueuse/core')).toBe('vue');
    expect(findVendorGroup('vue-demi')).toBe('vue');
  });

  it('identifies svelte ecosystem packages', () => {
    expect(findVendorGroup('svelte')).toBe('svelte');
    expect(findVendorGroup('@sveltejs/kit')).toBe('svelte');
    expect(findVendorGroup('svelte-preprocess')).toBe('svelte');
    expect(findVendorGroup('svelte-spa-router')).toBe('svelte');
  });

  it('identifies solid ecosystem packages', () => {
    expect(findVendorGroup('solid-js')).toBe('solid');
    expect(findVendorGroup('solid-js-store')).toBe('solid');
    expect(findVendorGroup('@solidjs/router')).toBe('router');
    expect(findVendorGroup('@solidjs/solid-start')).toBe('solid');
  });

  it('identifies preact ecosystem packages', () => {
    expect(findVendorGroup('preact')).toBe('preact');
    expect(findVendorGroup('preact/hooks')).toBe('preact');
    expect(findVendorGroup('preact/compat')).toBe('preact');
    expect(findVendorGroup('@preact/signals')).toBe('preact');
  });

  it('identifies angular ecosystem packages', () => {
    expect(findVendorGroup('@angular/core')).toBe('angular');
    expect(findVendorGroup('@angular/common')).toBe('angular');
    expect(findVendorGroup('@angular/router')).toBe('router');
    expect(findVendorGroup('@ngrx/store')).toBe('angular');
    expect(findVendorGroup('ng-zorro-antd')).toBe('angular');
    expect(findVendorGroup('zone.js')).toBe('angular');
  });
});

describe('RUNTIME_PACKAGES', () => {
  it('includes react runtime packages', () => {
    expect(RUNTIME_PACKAGES.react).toContain('react');
    expect(RUNTIME_PACKAGES.react).toContain('react-dom');
    expect(RUNTIME_PACKAGES.react).toContain('scheduler');
  });

  it('includes vue runtime packages', () => {
    expect(RUNTIME_PACKAGES.vue).toContain('vue');
    expect(RUNTIME_PACKAGES.vue).toContain('@vue/runtime-core');
  });

  it('includes svelte, solid, preact, angular runtime packages', () => {
    expect(RUNTIME_PACKAGES.svelte).toContain('svelte');
    expect(RUNTIME_PACKAGES.solid).toContain('solid-js');
    expect(RUNTIME_PACKAGES.preact).toContain('preact');
    expect(RUNTIME_PACKAGES.angular).toContain('@angular/core');
  });
});

describe('mergeRuntimePackages', () => {
  it('returns built-in defaults when no user config', () => {
    const merged = mergeRuntimePackages();
    expect(merged.react).toEqual(RUNTIME_PACKAGES.react);
    expect(merged.vue).toEqual(RUNTIME_PACKAGES.vue);
  });

  it('extends existing framework runtime packages', () => {
    const merged = mergeRuntimePackages({ react: ['my-react-helper'] });
    expect(merged.react).toContain('react');
    expect(merged.react).toContain('my-react-helper');
  });

  it('adds new frameworks', () => {
    const merged = mergeRuntimePackages({ myframework: ['my-runtime'] });
    expect(merged.myframework).toEqual(['my-runtime']);
    expect(merged.react).toEqual(RUNTIME_PACKAGES.react);
  });

  it('deduplicates packages', () => {
    const merged = mergeRuntimePackages({ react: ['react', 'react-dom'] });
    const reactEntries = merged.react.filter((p) => p === 'react');
    expect(reactEntries).toHaveLength(1);
  });
});

describe('findUserGroup', () => {
  it('matches exact package names', () => {
    const groups = { editor: ['monaco-editor'], charts: ['chart.js'] };
    expect(findUserGroup('monaco-editor', groups)).toBe('editor');
    expect(findUserGroup('chart.js', groups)).toBe('charts');
  });

  it('matches glob patterns', () => {
    const groups = { editor: ['monaco-editor', '@monaco-editor/*'] };
    expect(findUserGroup('@monaco-editor/react', groups)).toBe('editor');
  });

  it('returns undefined for non-matching packages', () => {
    const groups = { editor: ['monaco-editor'] };
    expect(findUserGroup('react', groups)).toBeUndefined();
  });

  it('returns undefined for empty groups', () => {
    expect(findUserGroup('react', {})).toBeUndefined();
  });
});
