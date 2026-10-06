import { Head, Html, Main, NextScript } from 'next/document';

// data-theme picks the colour theme: "light" (Cream), "dark" (Forest) or "contrast".
export default function Document() {
  return (
    <Html lang="en" data-theme="light">
      <Head>
        {/* A small deep-green and gold "F" as the tab icon, drawn inline so there is nothing to download (and no 404 for /favicon.ico). */}
        <link
          rel="icon"
          href={`data:image/svg+xml,${encodeURIComponent(
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='#173f2a'/><text x='32' y='47' font-family='Georgia,serif' font-size='42' font-weight='700' text-anchor='middle' fill='#c99b3b'>F</text></svg>",
          )}`}
        />
        {/* Installable on a phone's home screen (public/manifest.webmanifest). The icons are a placeholder letter until the
            brand's real logo exists (scripts/build-icons.mjs). There is deliberately no service worker: nothing is cached
            for offline use, so a customer can never be shown a stale price or order status. */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#173f2a" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-title" content="FreshBliss" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
