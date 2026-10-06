// /robots.txt: lets search engines in and points them at the sitemap. The sitemap line needs the shop's full address
// (NEXT_PUBLIC_SITE_URL / Vercel, else the address of this request). Private pages are kept out of search results with a
// noindex header (vercel.json), not by blocking them here (see lib/seo.js).

import { buildRobotsTxt, requestBase } from '@/lib/seo';

export function getServerSideProps({ req, res }) {
  const base = requestBase(req.headers);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
  res.write(buildRobotsTxt(base));
  res.end();
  return { props: {} };
}

// Never rendered: getServerSideProps has already sent the response.
export default function Robots() {
  return null;
}
