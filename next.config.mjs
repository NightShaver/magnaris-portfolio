/**
 * The site has no server side: every route is prerendered, there are no route
 * handlers and no server actions. So it is exported as plain files, which is
 * what GitHub Pages serves.
 *
 * NEXT_PUBLIC_BASE_PATH is set by the deploy workflow to `/<repo>` because a
 * GitHub project site lives in a subdirectory. Local development and any
 * root-level deployment leave it empty and behave exactly as before.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  // Pages has no image optimiser behind it; the captures ship as they are.
  images: { unoptimized: true },
  // Directory-style URLs, so a static host resolves them without rewrites.
  trailingSlash: true,
  // three.js ships untranspiled ESM examples — Next handles them, but we keep
  // the package optimizer aware of the 3D stack so dev startup stays fast.
  experimental: {
    optimizePackageImports: ["@react-three/drei", "motion"],
  },
};

export default nextConfig;
