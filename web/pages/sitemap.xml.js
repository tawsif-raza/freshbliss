// /sitemap.xml: every page worth finding, for search engines. The boxes come live from Firestore (so a new box is listed
// within the hour without a rebuild), and the answer is cached at the edge for an hour. The shop's own address comes from
// NEXT_PUBLIC_SITE_URL / Vercel (next.config.mjs), else from the address this request came to.
// If Firestore cannot be reached the answer is a short-lived 503, not a sitemap without boxes (lib/seo.js).

import { requestBase, sitemapResponse } from '@/lib/seo';
import { fetchActiveProducts } from '@/lib/serverCatalog';

export async function getServerSideProps({ req, res }) {
  const { status, headers, body } = sitemapResponse(requestBase(req.headers), await fetchActiveProducts());
  res.statusCode = status;
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.end(body);
  return { props: {} };
}

// Never rendered: getServerSideProps has already sent the response.
export default function Sitemap() {
  return null;
}
