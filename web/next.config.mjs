/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the project root so Next does not pick up a stray lockfile higher up the disk.
  turbopack: { root: import.meta.dirname },

  // Until the home page exists, the shop is the front door.
  async redirects() {
    return [{ source: '/', destination: '/products', permanent: false }];
  },
};

export default nextConfig;
