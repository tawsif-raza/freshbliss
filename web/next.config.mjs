/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the project root so Next does not pick up a stray lockfile higher up the disk.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
