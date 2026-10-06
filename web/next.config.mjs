import { remotePatterns } from './lib/imageHosts.mjs';

// The public address of the shop, for canonical links, social-share cards, the sitemap and robots.txt (lib/seo.js).
// NEXT_PUBLIC_SITE_URL wins; on Vercel the project's production domain is the fallback. Neither set (local
// development): empty, and those tags are simply left out rather than pointing at a made-up address.
const fromVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '';
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || fromVercel).trim().replace(/\/+$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the project root so Next does not pick up a stray lockfile higher up the disk.
  turbopack: { root: import.meta.dirname },

  env: { NEXT_PUBLIC_SITE_URL: siteUrl },

  // Photos are resized to the visitor's screen and sent as AVIF or WebP, then cached for 31 days (a photo address
  // never changes content: a new photo is a new address). Only the hosts in lib/imageHosts.mjs are fetched.
  images: {
    remotePatterns,
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 31,
  },
};

export default nextConfig;
