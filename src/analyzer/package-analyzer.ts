/** Extracts npm package names from module file paths (standard, scoped, pnpm). */

const NODE_MODULES = 'node_modules/';

export function isNodeModule(id: string): boolean {
  return id.includes(NODE_MODULES);
}

/** Extract the npm package name from a module path. Returns undefined for non-node_modules. */
export function extractPackageName(id: string): string | undefined {
  const idx = id.lastIndexOf(NODE_MODULES); // last occurrence handles pnpm nesting
  if (idx === -1) return undefined;

  const after = id.slice(idx + NODE_MODULES.length);

  // Scoped package: @scope/name/...
  if (after.startsWith('@')) {
    const slash = after.indexOf('/');
    if (slash === -1) return after;
    const secondSlash = after.indexOf('/', slash + 1);
    return secondSlash === -1 ? after : after.slice(0, secondSlash);
  }

  const slash = after.indexOf('/');
  return slash === -1 ? after : after.slice(0, slash);
}

/** Match a package name against a pattern (string glob with `*` or RegExp). */
export function matchPackage(packageName: string, pattern: string | RegExp): boolean {
  if (pattern instanceof RegExp) {
    return pattern.test(packageName);
  }
  if (pattern.includes('*')) {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`).test(packageName);
  }
  return packageName === pattern;
}

export function matchAnyPattern(packageName: string, patterns: (string | RegExp)[]): boolean {
  return patterns.some((p) => matchPackage(packageName, p));
}
