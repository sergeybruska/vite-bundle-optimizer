import { describe, it, expect } from 'vitest';
import {
  isNodeModule,
  extractPackageName,
  matchPackage,
  matchAnyPattern,
} from '../../src/analyzer/package-analyzer.js';

describe('isNodeModule', () => {
  it('returns true for node_modules paths', () => {
    expect(isNodeModule('/app/node_modules/react/index.js')).toBe(true);
    expect(isNodeModule('/app/node_modules/@mui/material/index.js')).toBe(true);
  });

  it('returns false for non-node_modules paths', () => {
    expect(isNodeModule('/app/src/index.ts')).toBe(false);
    expect(isNodeModule('/app/src/components/Button.tsx')).toBe(false);
  });

  it('returns true for pnpm nested paths', () => {
    expect(
      isNodeModule('/app/node_modules/.pnpm/react@18.0.0/node_modules/react/index.js'),
    ).toBe(true);
  });
});

describe('extractPackageName', () => {
  it('extracts simple package names', () => {
    expect(extractPackageName('/app/node_modules/react/index.js')).toBe('react');
    expect(extractPackageName('/app/node_modules/lodash/index.js')).toBe('lodash');
    expect(extractPackageName('/app/node_modules/lodash-es/lodash.js')).toBe('lodash-es');
  });

  it('extracts scoped package names', () => {
    expect(extractPackageName('/app/node_modules/@mui/material/index.js')).toBe(
      '@mui/material',
    );
    expect(extractPackageName('/app/node_modules/@babel/runtime/helpers.js')).toBe(
      '@babel/runtime',
    );
  });

  it('extracts package names from pnpm paths', () => {
    expect(
      extractPackageName('/app/node_modules/.pnpm/react@18.0.0/node_modules/react/index.js'),
    ).toBe('react');
    expect(
      extractPackageName(
        '/app/node_modules/.pnpm/@mui+material@5.0.0/node_modules/@mui/material/index.js',
      ),
    ).toBe('@mui/material');
  });

  it('returns undefined for non-node_modules paths', () => {
    expect(extractPackageName('/app/src/index.ts')).toBeUndefined();
    expect(extractPackageName('src/components/Button.tsx')).toBeUndefined();
  });

  it('handles package names with dots', () => {
    expect(extractPackageName('/app/node_modules/chart.js/dist/chart.js')).toBe('chart.js');
    expect(extractPackageName('/app/node_modules/date-fns/index.js')).toBe('date-fns');
  });
});

describe('matchPackage', () => {
  it('matches exact string patterns', () => {
    expect(matchPackage('react', 'react')).toBe(true);
    expect(matchPackage('react', 'react-dom')).toBe(false);
  });

  it('matches glob patterns with *', () => {
    expect(matchPackage('d3-scale', 'd3-*')).toBe(true);
    expect(matchPackage('d3-array', 'd3-*')).toBe(true);
    expect(matchPackage('chart', 'd3-*')).toBe(false);
  });

  it('matches @scope/* glob patterns', () => {
    expect(matchPackage('@mui/material', '@mui/*')).toBe(true);
    expect(matchPackage('@mui/icons', '@mui/*')).toBe(true);
    expect(matchPackage('@emotion/react', '@mui/*')).toBe(false);
  });

  it('matches RegExp patterns', () => {
    expect(matchPackage('react', /^react$/)).toBe(true);
    expect(matchPackage('react-dom', /^react$/)).toBe(false);
    expect(matchPackage('react-dom', /^react(-dom)?$/)).toBe(true);
  });
});

describe('matchAnyPattern', () => {
  it('returns true if any pattern matches', () => {
    expect(matchAnyPattern('react', ['react', 'react-dom'])).toBe(true);
    expect(matchAnyPattern('vue', ['react', 'react-dom'])).toBe(false);
    expect(matchAnyPattern('d3-scale', ['d3-*', 'chart.js'])).toBe(true);
  });

  it('handles mixed string and RegExp patterns', () => {
    expect(matchAnyPattern('react', ['react', /@internal/])).toBe(true);
    expect(matchAnyPattern('@internal/foo', ['react', /@internal/])).toBe(true);
  });
});
