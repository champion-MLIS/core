import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '../..');
const coreSrc = path.resolve(__dirname, '../../src');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the file-tracing root to the workspace root. Required because
  // server actions import runtime code from `../../src/` via the `@core/*`
  // alias; without this, Turbopack/Webpack refuses to resolve files
  // outside the dashboard directory.
  outputFileTracingRoot: workspaceRoot,
  // Resolve `@core/*` to the workspace's src/ directory at bundle time.
  // tsconfig's `paths` configuration only affects TypeScript type-checking;
  // Webpack and Turbopack need their own alias for runtime resolution.
  // Required once runtime imports from @core/* land (server actions that
  // re-use src/agent/* modules).
  turbopack: {
    resolveAlias: {
      '@core': coreSrc,
    },
  },
  // Disable the persistent on-disk Webpack cache in dev. The .pack.gz cache
  // race-conditions itself to death on macOS in this layout (Spotlight /
  // iCloud / some other file-watcher trips writes). Slightly slower
  // rebuilds, infinitely fewer ENOENT cascades.
  webpack(config, { dev }) {
    if (dev) {
      config.cache = false;
    }
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@core': coreSrc,
    };
    return config;
  },
};

export default nextConfig;
