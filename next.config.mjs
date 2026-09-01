/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // three.js ships untranspiled ESM examples — Next handles them, but we keep
  // the package optimizer aware of the 3D stack so dev startup stays fast.
  experimental: {
    optimizePackageImports: ["@react-three/drei", "motion"],
  },
};

export default nextConfig;
