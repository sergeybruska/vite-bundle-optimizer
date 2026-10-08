import { matchPackage } from '../analyzer/package-analyzer.js';

/** Built-in vendor group patterns mapping ecosystem packages to shared chunk names. */
export interface VendorGroup {
  name: string;
  patterns: RegExp[];
}

export const VENDOR_GROUPS: VendorGroup[] = [
  {
    name: 'react',
    patterns: [
      /^react$/,
      /^react-dom$/,
      /^react-is$/,
      /^react-jsx-runtime$/,
      /^react-reconciler$/,
      /^scheduler$/,
      /^prop-types$/,
    ],
  },
  {
    name: 'router',
    patterns: [
      /^react-router$/,
      /^react-router-dom$/,
      /^@remix-run\/.+/,
      /^@react-router\/.+/,
      /^wouter$/,
      /^@reach\/.+/,
      /^vue-router$/,
      /^@solidjs\/router$/,
      /^@tanstack\/solid-router$/,
      /^preact-router$/,
      /^@angular\/router$/,
    ],
  },
  {
    name: 'vue',
    patterns: [
      /^vue$/,
      /^@vue\//,
      /^vue-demi$/,
      /^pinia$/,
      /^@vueuse\//,
      /^@pinia\//,
    ],
  },
  {
    name: 'svelte',
    patterns: [
      /^svelte$/,
      /^@sveltejs\//,
      /^svelte-/,
    ],
  },
  {
    name: 'solid',
    patterns: [
      /^solid-js$/,
      /^solid-js-/,
      /^@solidjs\//,
    ],
  },
  {
    name: 'preact',
    patterns: [
      /^preact$/,
      /^preact\//,
      /^@preact\//,
    ],
  },
  {
    name: 'angular',
    patterns: [
      /^@angular\//,
      /^@ngrx\//,
      /^ng-zorro/,
      /^zone\.js$/,
    ],
  },
  {
    name: 'ui',
    patterns: [
      /^@mui\/.+/,
      /^@emotion\/.+/,
      /^@radix-ui\/.+/,
      /^@headlessui\/.+/,
      /^@nextui\/.+/,
      /^@heroui\/.+/,
      /^@chakra-ui\/.+/,
      /^antd$/,
      /^@ant-design\/.+/,
      /^arco-design$/,
      /^naive-ui$/,
      /^element-plus$/,
      /^vant$/,
      /^@arco-design\/.+/,
    ],
  },
  {
    name: 'charts',
    patterns: [
      /^chart\.js$/,
      /^recharts$/,
      /^d3-.+/,
      /^@nivo\/.+/,
      /^victory$/,
      /^echarts$/,
      /^@visx\/.+/,
      /^apexcharts$/,
      /^highcharts$/,
      /^billboard\.js$/,
      /^uplot$/,
    ],
  },
  {
    name: 'editor',
    patterns: [
      /^monaco-editor$/,
      /^@monaco-editor\/.+/,
      /^codemirror$/,
      /^@codemirror\/.+/,
      /^@uiw\/.+codemirror.+/,
      /^prosemirror-.+/,
      /^@tiptap\/.+/,
      /^tiptap$/,
    ],
  },
  {
    name: 'state',
    patterns: [
      /^redux$/,
      /^@reduxjs\/.+/,
      /^react-redux$/,
      /^zustand$/,
      /^mobx$/,
      /^mobx-react/,
      /^recoil$/,
      /^jotai$/,
      /^valtio$/,
      /^nanostores$/,
      /^@nanostores\/.+/,
      /^effector$/,
      /^@effector\/.+/,
    ],
  },
  {
    name: 'query',
    patterns: [
      /^@tanstack\/react-query$/,
      /^@tanstack\/query-.+/,
      /^swr$/,
      /^react-query$/,
      /^urql$/,
      /^@urql\/.+/,
      /^graphql$/,
      /^graphql-request$/,
      /^@apollo\/.+/,
    ],
  },
  {
    name: 'animation',
    patterns: [
      /^framer-motion$/,
      /^motion$/,
      /^@react-spring\/.+/,
      /^react-spring$/,
      /^gsap$/,
      /^animejs$/,
      /^anime\.js$/,
      /^popmotion$/,
      /^@lottiefiles\/.+/,
      /^lottie-react$/,
    ],
  },
  {
    name: 'i18n',
    patterns: [
      /^i18next$/,
      /^react-i18next$/,
      /^@formatjs\/.+/,
      /^vue-i18n$/,
      /^@intlify\/.+/,
      /^next-intl$/,
    ],
  },
  {
    name: 'utils',
    patterns: [
      /^lodash$/,
      /^lodash-es$/,
      /^date-fns$/,
      /^dayjs$/,
      /^moment$/,
      /^ramda$/,
      /^@babel\/runtime$/,
      /^tslib$/,
      /^rxjs$/,
      /^immutable$/,
      /^microdiff$/,
      /^deepmerge$/,
      /^clsx$/,
      /^classnames$/,
      /^nanoid$/,
    ],
  },
  {
    name: 'icons',
    patterns: [
      /^@iconify\/.+/,
      /^react-icons$/,
      /^lucide-react$/,
      /^@heroicons\/.+/,
      /^@fortawesome\/.+/,
      /^react-feather$/,
      /^@phosphor-icons\/.+/,
    ],
  },
];

/** Find the vendor group name for a package, or undefined. */
export function findVendorGroup(packageName: string): string | undefined {
  for (const group of VENDOR_GROUPS) {
    for (const pattern of group.patterns) {
      if (pattern.test(packageName)) {
        return group.name;
      }
    }
  }
  return undefined;
}

/** Match a package against user-defined group patterns (string globs or regexes). */
export function findUserGroup(
  packageName: string,
  groups: Record<string, string[]>,
): string | undefined {
  for (const [groupName, patterns] of Object.entries(groups)) {
    for (const pattern of patterns) {
      if (matchPackage(packageName, pattern)) {
        return groupName;
      }
    }
  }
  return undefined;
}

/**
 * Built-in framework runtime packages whose APIs are accessed at module-init
 * time by components (e.g. react.ForwardRef, vue's reactivity APIs,
 * svelte/internal, solid-js primitives). Packages transitively depending on
 * these must share the runtime's chunk to avoid "Cannot access X before
 * initialization" (TDZ) errors. Keys are framework names (matching vendor group
 * names); values are the core runtime package names.
 */
export const RUNTIME_PACKAGES: Record<string, string[]> = {
  react: ['react', 'react-dom', 'react-is', 'react-jsx-runtime', 'scheduler'],
  vue: ['vue', '@vue/runtime-core', '@vue/runtime-dom', '@vue/shared', '@vue/reactivity'],
  svelte: ['svelte'],
  solid: ['solid-js'],
  preact: ['preact'],
  angular: ['@angular/core'],
};

/**
 * Merge user-provided runtime packages with the built-in defaults.
 * User entries extend (not replace) the defaults for each framework,
 * and new frameworks can be added.
 */
export function mergeRuntimePackages(
  user?: Record<string, string[]>,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [key, packages] of Object.entries(RUNTIME_PACKAGES)) {
    result[key] = [...packages];
  }
  if (user) {
    for (const [key, packages] of Object.entries(user)) {
      if (result[key]) {
        const existing = new Set(result[key]);
        for (const p of packages) existing.add(p);
        result[key] = [...existing];
      } else {
        result[key] = [...packages];
      }
    }
  }
  return result;
}
