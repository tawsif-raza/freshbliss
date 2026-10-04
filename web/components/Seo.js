// The <head> tags a page needs to rank and to look good when shared: title, description, the canonical link, and the
// Open Graph / Twitter tags that WhatsApp, Instagram, Facebook and X turn into a preview card with a photo.
// What goes in them is decided by lib/seo.js (buildMetaTags), which is tested; this only draws it.
//
// `path` is the page's own address without the query string. Tags that need the shop's public address (canonical, og:url)
// are left out when it is not known yet (local development), never filled with a guess.

import Head from 'next/head';
import { buildMetaTags } from '@/lib/seo';

export default function Seo({ title, description, path, image, type, product, children }) {
  const { canonical, meta } = buildMetaTags({ title, description, path, image, type, product });
  return (
    <Head>
      <title>{title}</title>
      {canonical && <link key="canonical" rel="canonical" href={canonical} />}
      {meta.map(({ key, name, property, content }) => (
        <meta key={key} name={name} property={property} content={content} />
      ))}
      {children}
    </Head>
  );
}
