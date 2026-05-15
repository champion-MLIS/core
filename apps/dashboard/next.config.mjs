import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the file-tracing root so Next doesn't get confused by the parent
  // repo's package-lock.json (this is a monorepo-style layout — the
  // dashboard's package.json lives at apps/dashboard).
  outputFileTracingRoot: __dirname,
  // The dashboard imports types from the parent monorepo
  // (../../src/db/types.generated.ts). tsconfig path aliases handle this;
  // no Webpack tweaks needed.
};

export default nextConfig;
