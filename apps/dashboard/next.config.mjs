import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the file-tracing root so Next doesn't get confused by the parent
  // repo's package-lock.json.
  outputFileTracingRoot: __dirname,
  // Disable the persistent on-disk Webpack cache in dev. The .pack.gz cache
  // race-conditions itself to death on macOS in this layout (Spotlight /
  // iCloud / some other file-watcher trips writes). Slightly slower
  // rebuilds, infinitely fewer ENOENT cascades.
  webpack(config, { dev }) {
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
