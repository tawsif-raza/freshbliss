Use FreshBliss for premium fresh-cut fruit delivery: a warm cream page, deep forest green for structure, and gold only for the actions and highlights that earn attention. Load `tokens.css` first, then `components/bundle.css`, then `components/bundle.js` (namespace `FreshBliss`).

## Content fundamentals

- Write in short, sensory, benefit-first lines. Real copy: "Fresh Fruits, Healthier You", "Freshly sliced. Perfectly packed. Always.", "Premium sliced and packed fruit boxes for your daily freshness."
- Sentence case for headings and buttons ("Shop Now", "Add to Cart", "Track Order"). Uppercase only for `label` eyebrows.
- Address the customer as "you" and the brand as "we". Lead with freshness, hygiene, speed (1 hour delivery in Bangalore) and healthy living.
- Prices are rupees with the symbol and no decimals: `₹149`, `₹328`. Times are 12-hour with AM/PM ("12:31 PM"), ETAs read "Arriving in 18 min".
- Ramadan is a seasonal layer ("Ramadan Special", "Freshness for Iftar"), never the permanent identity. Use it through the theme switch, not new copy everywhere.
- No emoji. Status always has a word ("Delivered", "Out for Delivery", "Cancelled"), never color alone.

## Visual foundations

- **Color.** Page is `surface-page`; cards and diagram nodes are `surface-card`. Body text is `ink`, secondary text `ink-muted` (on any cream surface). Headings, table headers and links are `brand-text`. Solid buttons and selected states fill with `brand` and carry `on-brand` text. `gold-bright` (the brand #c99b3b) fills the primary call to action (`on-gold` text) and colors the second line of the hero title and any gold mark on `hero-deep`. On cream use `gold`, a deeper brass, for gold text, lines and rings (5:1); never put `gold-bright` on cream as text or a line (2.3:1).
- **Two themes.** `light` (Cream) is the default shop. `dark` (Forest) keeps the same hierarchy with `surface-page` #102019 and `surface-card` in brand green. Hero and feature panels are always `hero-deep` to `hero-mid` at 135deg with `on-hero` and white text, in both themes.
- **Type.** Georgia (with Playfair Display as a fallback) for `display` and `heading-2`; Inter for everything else; monospace for `code`, ids, prices in tables of data and sheet columns. Hero uses `display` with the second line in `gold-bright`. Prices use `kpi` in `brand-text`.
- **Shape.** Cards `radius-xl` (18px) with a `line` border and `shadow-card`; diagram nodes `radius-md`; tables and code `radius-lg`; buttons, tags and badges `radius-pill`.
- **Space.** Page gutter `space-24`, card padding `space-24`, grid gap `space-18`, section padding `space-58`, container `container-max` (1200px).
- **Callouts.** A 5px `gold` left rule on `surface-callout` for a rule or tip; a `danger` rule on `surface-danger` for a warning. This is the one place a left rule is used.
- **Motion.** Fade-and-slide on scroll, soft springs on hover, 200 to 450ms ease-out for panels. Always honor `prefers-reduced-motion`. Use 3D sparingly: hero and optional product view only.
- **Focus.** 2px solid `focus-ring`, 2px offset, on every interactive element.
- **Imagery.** Photography of sliced fruit in clear boxes, on dark green or cream backdrops, high saturation fruit against calm ground. No photos were supplied; add them under `assets/Photography` when available.

## Iconography

Icons on the brand board are single-weight outline glyphs in a `brand`-tinted circle (freshness leaf, clock, heart, pin, wishlist heart). No icon files were supplied, so previews use two-letter mono badges instead. Substitute an outline set such as Lucide at 1.75px stroke and flag it until the brand's own icons arrive.

## Logo

The wordmark is "FreshBliss" with a leaf mark and the line "Freshness Delivered", but no logo file was attached. Set the name in `display` type in `brand-text` and do not redraw the mark; add the real files under `assets/Logos` when available.

## Components

Use `Button` (`gold` variant, filled `gold-bright`, for primary actions, `primary` for structure, `outline` for secondary), `Tag` for categories, `Badge` for eyebrows, `Card` for grouped content, `Stat` for a number with a label, `Callout` for rules, `CodeBlock` and `DataTable` for engineering content, `ProductCard`, `ProductDetail`, `HomeScreen`, `Cart` and `OrderTracking` for the storefront, with `DeliveryChecker`, `SupportButton`, `ShareButton` and `FeedbackForm` as the delivery essentials (the home page, a fruit box card with image slots and a wishlist heart, the cart with order summary, and the live order tracker fed by a Firestore-style `subscribe`), and `ArchitectureExplorer` for the interactive system diagram with the customer journey, technical architecture and Firebase to Excel data flow.

## Delivery essentials

A delivery app needs more than a catalogue. Every customer path should offer: a pincode availability check before checkout (`DeliveryChecker`), a promo field, a free-delivery progress bar and a rider tip in the cart, delivery instructions, Save for later, and Clear cart with a confirm step; on the tracker, Share tracking, Copy order ID, Call rider and delivery code while out for delivery, Cancel order with a reason until packed, Get help, then Order again and `FeedbackForm` after delivery; on the product page, Share and Notify me when back for sold-out boxes; and a floating `SupportButton` (WhatsApp, call, FAQs) on the home page. The pincode rule, promo codes and support number in the previews are placeholders. Anything that changes money or stock (fee, promo, tip, cancel, refund) is validated on the server; the components only preview it.

## Accessibility

Build to WCAG 2.1 AA. Wrap every page in `A11yProvider` and put `A11yPanel` in the navigation so customers can choose High contrast, reduced motion and larger text; include the skip link and give the page `<main id="fbs-main">`. Motion is always optional: honor `prefers-reduced-motion`, never gate checkout on an animation, and give the 3D view a static photo fallback. Interactive controls are at least 44px tall, carry a visible `focus-ring`, and convey state with text as well as color. The `contrast` theme is an added theme, not a re-tint of the brand: text is 7:1 or better and borders 3:1 or better; keep `gold-bright` to fills and hero surfaces.
