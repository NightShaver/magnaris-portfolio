/**
 * Asset paths under a base path
 * -----------------------------
 * On Vercel or any own domain the site is served from the root, and every
 * `/audio/...` or `/cases/...` string resolves as written. GitHub Pages serves
 * a project site from `/<repo>/` instead, so those absolute paths would miss.
 *
 * Next rewrites the URLs it controls itself — routes, `next/image`, its own
 * chunks — but not strings we hand to `new Audio()` or to a texture loader.
 * Those go through `asset()`.
 *
 * NEXT_PUBLIC_BASE_PATH is inlined at build time, so this works in server and
 * client components alike. Empty by default: local development and root
 * deployments need no prefix.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Prefixes a public-folder path with the deployment's base path. */
export function asset(path: string): string {
  return `${BASE_PATH}${path}`;
}
