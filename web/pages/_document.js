import { Head, Html, Main, NextScript } from 'next/document';

// data-theme picks the colour theme: "light" (Cream), "dark" (Forest) or "contrast".
export default function Document() {
  return (
    <Html lang="en" data-theme="light">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
