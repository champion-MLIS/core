/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The dashboard imports types from the parent monorepo (src/db/types.generated.ts).
  // tsconfig path aliases handle this; no Webpack tweaks needed.
};

export default nextConfig;
