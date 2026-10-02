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
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
