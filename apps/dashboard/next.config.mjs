import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin Turbopack's workspace root to this directory. Without this, Next sees
  // two package-lock.json files (root + dashboard) and guesses wrong, then
  // writes the build cache to one path while reading from another — which
  // surfaces as ENOENT spam and 500s on every page load.
  turbopack: {
    root: __dirname,
  },
  // The dashboard imports types from the parent monorepo
  // (../../src/db/types.generated.ts). tsconfig path aliases handle this;
  // no Webpack tweaks needed.
};

export default nextConfig;
