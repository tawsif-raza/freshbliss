/* @ds-bundle: {"format":4,"namespace":"FreshBliss","components":[{"name":"Button"},{"name":"Tag"},{"name":"Badge"},{"name":"Card"},{"name":"Stat"},{"name":"Callout"},{"name":"CodeBlock"},{"name":"DataTable"},{"name":"ArchitectureExplorer"},{"name":"ProductCard"},{"name":"HomeScreen"},{"name":"Cart"},{"name":"OrderTracking"},{"name":"ProductDetail"},{"name":"A11yProvider"},{"name":"A11yPanel"},{"name":"SkipLink"},{"name":"FeedbackForm"},{"name":"DeliveryChecker"},{"name":"SupportButton"},{"name":"ShareButton"}]} */
(function () {
  var R = window.React;
  var h = R.createElement;
  var useState = R.useState, useEffect = R.useEffect, useRef = R.useRef;
  function cx() { return Array.prototype.filter.call(arguments, Boolean).join(' '); }
  function rest(p, skip) { var o = {}; for (var k in p) if (skip.indexOf(k) < 0) o[k] = p[k]; return o; }

  /* ------------------------------------------------------------ primitives */
  function Button(p) {
    var v = p.variant || 'primary';
    return h('button', Object.assign({ type: 'button' }, rest(p, ['variant', 'size', 'children', 'className']),
      { className: cx('fb-btn', 'fb-btn--' + v, p.size === 'sm' && 'fb-btn--sm', p.className) }), p.children);
  }
  function Tag(p) { return h('span', { className: cx('fb-tag', p.className) }, p.children); }
  function Badge(p) { return h('span', { className: cx('fb-badge', p.tone === 'onDark' && 'fb-badge--onDark', p.className) }, p.children); }
  function Card(p) {
    return h('div', { className: cx('fb-card', p.className) }, p.title ? h('h3', null, p.title) : null,
      typeof p.children === 'string' ? h('p', null, p.children) : p.children);
  }
  function Stat(p) {
    return h(Card, { className: p.className },
      h('div', { className: 'fb-stat-value' }, p.value),
      h('div', { className: 'fb-stat-label' }, p.label),
      p.note ? h('div', { className: 'fb-stat-note' }, p.note) : null);
  }
  function Callout(p) {
    return h('div', { className: cx('fb-callout', p.tone === 'warning' && 'fb-callout--warning', p.className) },
      p.title ? h('strong', null, p.title + ' ') : null, p.children);
  }
  function CodeBlock(p) { return h('pre', { className: cx('fb-code', p.className) }, p.children); }
  function DataTable(p) {
    var cols = p.columns || [], rows = p.rows || [];
    return h('table', { className: cx('fb-table', p.className) },
      h('thead', null, h('tr', null, cols.map(function (c) { return h('th', { key: c }, c); }))),
      h('tbody', null, rows.map(function (r, i) {
        return h('tr', { key: i }, r.map(function (c, j) { return h('td', { key: j }, c); }));
      })));
  }

  /* ------------------------------------------------------------ explorer data */
  var N = {};
  function add(o) { N[o.id] = o; }

  /* technical components */
  add({ id: 'nextjs', kind: 'tech', layer: 'frontend', mono: 'NX', label: 'Next.js (React)', sub: 'Customer app · SEO · routing',
    role: 'The customer web app and the admin panel in one codebase, deployed on Vercel.',
    points: ['Server-rendered product and category pages so search engines can index the catalogue.',
      'Guests browse, wishlist and fill a cart before any login; auth is asked for only at checkout.',
      'Subscribes to Firestore so stock badges and order status update without a refresh.',
      'Never decrements stock or marks a payment paid: it only asks a Cloud Function to do it.'],
    talksTo: ['tailwind', 'motion', 'three', 'admin', 'auth', 'firestore', 'storage', 'functions', 'razorpay', 'maps'],
    snippet: 'app/\n  page.js            // hero + boxes\n  products/[slug]    // gallery + 3D\n  checkout/          // OTP + payment\n  orders/[id]        // live tracking\n  admin/             // gated by claim',
    rule: 'Client code is untrusted. Every price, stock and payment decision is re-checked in Cloud Functions.' });
  add({ id: 'tailwind', kind: 'tech', layer: 'frontend', mono: 'TW', label: 'Tailwind CSS', sub: 'Tokens as utilities',
    role: 'Responsive, mobile-first styling. Tailwind config carries the FreshBliss tokens.',
    points: ['Map color, radius and spacing tokens into the theme so utilities and components agree.',
      'Mobile-first: most Bengaluru orders arrive from phones.',
      'Ramadan theme is a data-theme switch, not a second stylesheet.'],
    talksTo: ['nextjs'], snippet: "theme.extend.colors = {\n  brand: 'var(--brand)',\n  gold:  'var(--gold)',\n  page:  'var(--surface-page)'\n}" });
  add({ id: 'motion', kind: 'tech', layer: 'frontend', mono: 'FM', label: 'Framer Motion', sub: 'Scroll + hover animation',
    role: 'Scroll reveals, parallax on the hero, spring micro-interactions and shared image transitions into product detail.',
    points: ['Fade and slide sections in on scroll; soft spring on card hover.',
      'Shared layout transition from product card image to the detail gallery.',
      'Honor prefers-reduced-motion by switching transitions off.'],
    talksTo: ['nextjs'], rule: 'Motion should make the page feel premium, never delay checkout.' });
  add({ id: 'three', kind: 'tech', layer: 'frontend', mono: '3D', label: 'Three.js / R3F', sub: 'Interactive 3D fruit box',
    role: 'One lightweight rotating fruit-box scene in the hero and an optional interactive view on product pages.',
    points: ['Lazy-load the canvas and models so the first paint stays fast on mobile.',
      'Use it selectively: hero, optional product detail and subtle floating fruit on the story section.',
      'Always have a static image fallback for low-power devices.'],
    talksTo: ['nextjs', 'storage'], rule: 'Do not make every section 3D. Optimize models and lazy-load.' });
  add({ id: 'admin', kind: 'tech', layer: 'frontend', mono: 'AD', label: 'Admin Panel', sub: 'Orders · stock · Ramadan mode',
    role: 'Staff-only screens inside the same Next.js app: dashboard, products, inventory, orders, feedback and settings.',
    points: ['Create or edit products, upload 2 to 4 images, toggle active state.',
      'Move an order through Preparing, Packed, Out for Delivery, Delivered.',
      'Turn Ramadan mode on or off, or schedule its start and end dates.',
      'Categories and delivery zones are documents, so adding one needs no deploy.'],
    talksTo: ['nextjs', 'firestore', 'functions', 'storage'], rule: 'Admin access comes from a server-set custom claim, checked again in Firestore rules.' });

  add({ id: 'auth', kind: 'tech', layer: 'backend', mono: 'AU', label: 'Firebase Auth', sub: 'Phone OTP',
    role: 'Passwordless sign-in by phone number, requested only when the customer reaches checkout.',
    points: ['Guests keep their cart in the browser; it merges into the account after login.',
      'Email is optional and collected at checkout for receipts.',
      'Custom claims mark admin and delivery staff accounts.'],
    talksTo: ['nextjs', 'firestore'], rule: 'Browse without an account. Ask for the phone number as late as possible.' });
  add({ id: 'firestore', kind: 'tech', layer: 'backend', mono: 'FS', label: 'Firestore', sub: 'Orders · users · inventory',
    role: 'The live source of truth: products, users, orders, feedback, settings, deliveryZones and categories.',
    points: ['Real-time listeners push stock and order status to every open browser.',
      'A write to orders/{id} is the trigger that starts the Excel sync.',
      'Security rules block clients from writing stock, price or paymentStatus.',
      'Excel is never read back into Firestore.'],
    talksTo: ['nextjs', 'auth', 'functions', 'admin'],
    snippet: 'users/{uid}   name phone addresses wishlist\nproducts/{id} name price stock images active\norders/{id}   customerId items total status\n              paymentStatus address timestamps\nfeedback  settings  deliveryZones  categories',
    rule: 'Firebase is the operational database. Excel is the reporting layer.' });
  add({ id: 'storage', kind: 'tech', layer: 'backend', mono: 'ST', label: 'Firebase Storage', sub: 'Product images and media',
    role: 'Holds the 2 to 4 images per product plus 3D model files, served through the CDN.',
    points: ['Admin uploads go through signed rules; customers only read.',
      'Store the download path on the product document, not the image itself.',
      'Compress before upload to protect mobile page weight.'],
    talksTo: ['nextjs', 'three', 'admin'] });
  add({ id: 'functions', kind: 'tech', layer: 'backend', mono: 'CF', label: 'Cloud Functions', sub: 'The trusted server',
    role: 'The only place that creates orders, verifies payments, decrements stock and writes to Excel.',
    points: ['createOrder: re-prices the cart from Firestore and stores a draft order.',
      'verifyPayment: checks the Razorpay signature, then runs one stock transaction.',
      'onOrderWrite: appends or updates the Excel row through Microsoft Graph.',
      'Retries are safe because every step is keyed by the order id.'],
    talksTo: ['firestore', 'razorpay', 'maps', 'graph', 'nextjs', 'admin'],
    snippet: "await db.runTransaction(async (tx) => {\n  const snaps = await Promise.all(\n    items.map(i => tx.get(productRef(i.id))));\n  snaps.forEach((s, k) => {\n    if (s.get('stock') < items[k].qty)\n      throw new HttpsError('aborted', 'OUT_OF_STOCK');\n  });\n  snaps.forEach((s, k) => tx.update(s.ref, {\n    stock: s.get('stock') - items[k].qty }));\n  tx.update(orderRef, { status: 'PAYMENT_CONFIRMED' });\n});",
    rule: 'Never trust a browser-side stock decrement or payment-success flag.' });

  add({ id: 'razorpay', kind: 'tech', layer: 'external', mono: 'RZ', label: 'Razorpay', sub: 'Payments (India)',
    role: 'Collects UPI, card and netbanking payments. The browser shows the checkout; the server decides whether it counts.',
    points: ['createOrder returns a Razorpay order id; the checkout opens with it.',
      'On success the browser sends order id, payment id and signature to verifyPayment.',
      'A webhook is the backup if the customer closes the tab after paying.'],
    talksTo: ['nextjs', 'functions'],
    snippet: 'expected = HMAC_SHA256(\n  order_id + "|" + payment_id, KEY_SECRET)\nvalid = timingSafeEqual(expected, signature)',
    rule: 'The cart is cleared only after the backend confirms payment, not when Pay is clicked.' });
  add({ id: 'maps', kind: 'tech', layer: 'external', mono: 'GM', label: 'Google Maps', sub: 'Zones · ETA',
    role: 'Turns an address into a delivery zone, fee and ETA, and later carries live driver location.',
    points: ['Zone A 0 to 3 km is free, Zone B 3 to 6 km costs 30 rupees, Zone C 6 to 8 km costs 50 rupees.',
      'Zone radius, fee and availability live in deliveryZones so admin can change them.',
      'Start with status and ETA; true GPS needs a delivery-partner app sending location.'],
    talksTo: ['nextjs', 'functions'], rule: 'Outside the service area the order button is disabled with a clear reason.' });

  add({ id: 'graph', kind: 'tech', layer: 'reporting', mono: 'MG', label: 'Microsoft Graph', sub: 'Excel REST API',
    role: 'The bridge from Cloud Functions to the workbook stored in OneDrive or SharePoint.',
    points: ['Authenticates as an app, so no staff login is needed.',
      'Appends rows to named tables and patches a row when the status changes.',
      'Looks up the row by Order ID first so a retry never creates a duplicate.'],
    talksTo: ['functions', 'excel'],
    snippet: 'POST /drives/{drive}/items/{file}/workbook\n     /tables/Orders/rows/add\n{ "values": [[ "FB10291", "2026-09-29", ... ]] }' });
  add({ id: 'excel', kind: 'tech', layer: 'reporting', mono: 'XL', label: 'Excel workbook', sub: 'FreshBliss_Operations.xlsx',
    role: 'Business reporting and analysis: Orders, Customers, Products, Feedback and Analytics sheets.',
    points: ['Owners get pivots, charts and filters they already know.',
      'Write-only from the app. Editing a cell does not change an order.',
      'If Graph is down, Firestore keeps working and the sync catches up.'],
    talksTo: ['graph'], rule: 'Do not use Excel as the live order database.' });

  /* journey steps */
  var J = [
    ['browse', 'Browse', 'No account needed', 'Premium animated home, then Fresh, Fitness or Ramadan.', ['Home shows the seasonal hero, popular boxes and categories loaded from Firestore.', 'Guests can wishlist locally and merge it after login.'], ['nextjs', 'motion', 'firestore']],
    ['product', 'Product', '2 to 4 images or 3D', 'Gallery, optional 3D view, price, availability and quantity.', ['Images come from Storage; the 3D view lazy-loads.', 'Add to Cart is disabled the moment stock reaches 0.'], ['nextjs', 'three', 'storage', 'firestore']],
    ['cart', 'Wishlist and Cart', 'Subtotal, fee, total', 'Save for later, change quantity, see delivery fee and discount.', ['Cart lives in the browser for guests and in Firestore after login.', 'Totals shown here are previews; the server recomputes them.'], ['nextjs', 'firestore']],
    ['checkout', 'Checkout', 'Start of the critical path', 'Delivery details, instructions and the pay button.', ['The address is checked against delivery zones for fee and ETA.', 'createOrder stores a draft order with server-computed prices.'], ['nextjs', 'maps', 'functions']],
    ['otp', 'OTP login', 'Phone number, six digits', 'Authenticate only when the customer commits.', ['Firebase Auth sends and verifies the code.', 'The guest cart merges into the account.'], ['auth', 'nextjs']],
    ['details', 'Address', 'Saved for next time', 'Name, phone, address and optional email.', ['Addresses are saved on the user document for one-tap reorder.'], ['firestore', 'maps']],
    ['payment', 'Payment', 'Razorpay checkout', 'Pay by UPI, card or netbanking.', ['The browser result is only a claim. The signature is verified server-side.'], ['razorpay', 'functions']],
    ['confirmed', 'Confirmed', 'Order id + ETA', 'Confirmation screen with the order number and ETA.', ['Status moves to PAYMENT_CONFIRMED only after verification succeeds.'], ['firestore', 'nextjs']],
    ['tracking', 'Tracking', 'Live status', 'Confirmed, Preparing, Packed, Out for Delivery, Delivered.', ['The page listens to orders/{id}; the admin panel writes each step.', 'GPS is a later phase.'], ['firestore', 'admin', 'maps']],
    ['feedback', 'Feedback', 'Rating + comments', 'Overall, packaging and delivery ratings.', ['Feedback lands in Firestore, then the Excel Feedback sheet for reporting.'], ['firestore', 'functions', 'excel']]
  ];
  J.forEach(function (j, i) {
    add({ id: 'j-' + j[0], kind: 'step', mono: String(i + 1), label: j[1], sub: j[2], role: j[3], points: j[4], talksTo: j[5] });
  });

  /* order lifecycle */
  var LC = [
    ['checkout', 'Checkout', 'Draft order stored', 'The cart becomes a draft order priced by the server. Nothing is charged and no stock moves yet.', ['createOrder re-reads prices and availability from Firestore.', 'Status is PLACED and paymentStatus is PENDING.'], ['nextjs', 'functions', 'firestore']],
    ['pay', 'Payment verified', 'Signature checked', 'Razorpay reports success; the backend proves it before believing it.', ['HMAC of order id and payment id must match the signature.', 'The webhook covers a closed tab.'], ['razorpay', 'functions']],
    ['stock', 'Stock decremented', 'One transaction', 'All items are checked and decremented together, or none are.', ['Reads first, then writes, inside a Firestore transaction.', 'Stock at 0 flips the product to Out of stock for every open browser.'], ['functions', 'firestore']],
    ['cart', 'Cart cleared', 'Only after confirm', 'The cart is emptied once the order is confirmed, never on the Pay click.', ['A failed payment leaves the cart intact so the customer can retry.'], ['firestore', 'nextjs']],
    ['excel', 'Excel updated', 'Row appended', 'The order write triggers a function that appends the row through Microsoft Graph.', ['Keyed by order id, so retries update instead of duplicating.', 'A Graph outage never blocks the customer.'], ['functions', 'graph', 'excel']]
  ];
  LC.forEach(function (l, i) {
    add({ id: 'lc-' + l[0], kind: 'stage', mono: String(i + 1), label: l[1], sub: l[2], role: l[3], points: l[4], talksTo: l[5] });
  });
  var LCIDS = LC.map(function (l) { return 'lc-' + l[0]; });

  /* data flow */
  var DF = [
    ['order', 'Order confirmed', 'Firestore write', 'orders/{id} changes to PAYMENT_CONFIRMED, or later to PREPARING, PACKED, DELIVERED.', ['Every status change is a write the pipeline can react to.'], ['firestore']],
    ['trigger', 'Trigger', 'Firestore trigger', 'Firestore invokes the sync function with before and after snapshots.', ['Function runs only when a field Excel cares about changed.'], ['firestore', 'functions']],
    ['fn', 'Cloud Function', 'Shape the row', 'Maps an order into the sheet columns and computes daily totals.', ['Idempotent by order id.', 'Retries with backoff if Graph returns 429 or 5xx.'], ['functions']],
    ['graph', 'Microsoft Graph', 'rows/add or PATCH', 'Writes to the workbook in OneDrive or SharePoint as the app.', ['App-only token, cached until expiry.'], ['graph']],
    ['workbook', 'Excel sheets', 'Orders · Customers', 'Orders, Customers, Products, Feedback and Analytics update.', ['Owners filter and pivot; nothing flows back.'], ['excel']],
    ['insight', 'Analytics', 'Owner insights', 'Revenue, repeat rate, average order value and top products.', ['Average delivery time and cancellation rate come from status timestamps.'], ['excel']]
  ];
  DF.forEach(function (d, i) {
    add({ id: 'df-' + d[0], kind: 'flow', mono: String(i + 1), label: d[1], sub: d[2], role: d[3], points: d[4], talksTo: d[5] });
  });
  var DFIDS = DF.map(function (d) { return 'df-' + d[0]; });

  var SHEETS = {
    Orders: ['Order ID', 'Date', 'Time', 'Customer Name', 'Phone', 'Email', 'Address', 'Products', 'Quantity', 'Subtotal', 'Delivery Fee', 'Discount', 'Total', 'Payment Status', 'Order Status', 'Delivery Partner', 'Order Time', 'Delivery Time'],
    Customers: ['Customer ID', 'Name', 'Phone', 'Email', 'First Order', 'Last Order', 'Total Orders', 'Total Spend', 'Average Order Value', 'Last Order Date'],
    Products: ['Product ID', 'Product Name', 'Category', 'Price', 'Cost', 'Stock', 'Units Sold', 'Revenue', 'Status'],
    Feedback: ['Feedback ID', 'Order ID', 'Customer', 'Rating', 'Feedback', 'Date', 'Product', 'Delivery Rating', 'Packaging Rating'],
    Analytics: ['Date', 'Orders', 'Revenue', 'Average Order Value', 'New Customers', 'Returning Customers', 'Top Product', 'Cancellation Rate', 'Average Delivery Time']
  };

  var LANES = [
    { key: 'frontend', name: 'Customer web app', note: 'Next.js on Vercel', ids: ['nextjs', 'tailwind', 'motion', 'three', 'admin'] },
    { key: 'backend', name: 'Live operational layer', note: 'Firebase', ids: ['auth', 'firestore', 'storage', 'functions'] },
    { key: 'external', name: 'External integrations', note: 'Called from the server', ids: ['razorpay', 'maps'] },
    { key: 'reporting', name: 'Reporting layer', note: 'Microsoft 365', ids: ['graph', 'excel'] }
  ];
  var VIEW_OF = { tech: 'arch', step: 'journey', stage: 'journey', flow: 'flow' };
  var KIND_LABEL = { tech: 'Technical component', step: 'Customer step', stage: 'Order lifecycle stage', flow: 'Data flow stage' };

  /* ------------------------------------------------------------ pieces */
  function Arrow() {
    return h('svg', { width: 16, height: 28, viewBox: '0 0 16 28', 'aria-hidden': true },
      h('path', { d: 'M8 0V22M2 16l6 8 6-8', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }));
  }
  function Connector(p) {
    return h('div', { className: 'fbx-connector' }, h(Arrow), h('span', { className: 'fbx-con-label' }, p.label), h(Arrow));
  }
  function FlowArrow() {
    return h('span', { className: 'fbx-arrow', 'aria-hidden': true },
      h('svg', { width: 22, height: 16, viewBox: '0 0 22 16' },
        h('path', { d: 'M1 8H19M14 3l5 5-5 5', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' })));
  }

  function Panel(p) {
    var n = p.node;
    if (!n) return h('aside', { className: 'fbx-panel', 'aria-hidden': true });
    var chips = (n.talksTo || []).map(function (id) {
      var t = N[id];
      return t ? h('button', { key: id, type: 'button', className: 'fbx-chip', onClick: function () { p.onGo(id); } }, t.label) : null;
    });
    return h('aside', { className: 'fbx-panel', 'aria-live': 'polite', 'aria-label': 'Details for ' + n.label },
      h('div', { className: 'fbx-panel-inner', key: n.id },
        h('div', { className: 'fbx-panel-top' },
          h('span', { className: 'fbx-eyebrow' }, KIND_LABEL[n.kind] + (p.pinned ? '' : ' · click to pin')),
          h('button', { type: 'button', className: 'fbx-close', onClick: p.onClose }, 'Close')),
        h('h3', null, n.label),
        h('p', { className: 'fbx-role' }, n.role),
        h('h4', null, n.kind === 'tech' ? 'Its job here' : 'What happens'),
        h('ul', null, n.points.map(function (t, i) { return h('li', { key: i }, t); })),
        chips.length ? h('h4', null, n.kind === 'tech' ? 'Talks to' : 'Components involved') : null,
        chips.length ? h('div', { className: 'fbx-chips' }, chips) : null,
        n.snippet ? h('h4', null, 'Sketch') : null,
        n.snippet ? h('pre', { className: 'fb-code' }, n.snippet) : null,
        n.rule ? h(Callout, { className: 'fbx-rule', title: 'Rule.' }, n.rule) : null));
  }

  /* ------------------------------------------------------------ explorer */
  function ArchitectureExplorer(props) {
    var s0 = useState(props.initialView || 'journey'), view = s0[0], setView = s0[1];
    var s1 = useState(null), selected = s1[0], setSelected = s1[1];
    var s2 = useState(null), hovered = s2[0], setHovered = s2[1];
    var s3 = useState(-1), lc = s3[0], setLc = s3[1];
    var s4 = useState(false), playing = s4[0], setPlaying = s4[1];
    var s5 = useState('Orders'), sheet = s5[0], setSheet = s5[1];
    var last = useRef(null);
    var timer = useRef(null);

    useEffect(function () {
      if (!playing) return undefined;
      timer.current = setInterval(function () {
        setLc(function (i) { return i + 1; });
      }, 1100);
      return function () { clearInterval(timer.current); };
    }, [playing]);
    useEffect(function () {
      if (!playing) return;
      if (lc >= LCIDS.length) { setPlaying(false); return; }
      if (lc >= 0) setSelected(LCIDS[lc]);
    }, [lc, playing]);

    function switchView(v) { setPlaying(false); setSelected(null); setHovered(null); setView(v); }
    function go(id) { var n = N[id]; if (!n) return; setPlaying(false); setHover(null); setView(VIEW_OF[n.kind]); setSelected(id); }
    function setHover(id) { setHovered(id); }
    function toggle(id) { setPlaying(false); setSelected(function (c) { return c === id ? null : id; }); }
    function play() { setSelected(null); setLc(0); setPlaying(true); }

    var active = selected || hovered;
    var node = active ? N[active] : null;
    if (node) last.current = node;
    var shown = node || last.current;
    var rel = {};
    if (node && node.kind === 'tech') {
      (node.talksTo || []).forEach(function (x) { rel[x] = true; });
      Object.keys(N).forEach(function (k) { if (N[k].kind === 'tech' && (N[k].talksTo || []).indexOf(node.id) >= 0) rel[k] = true; });
    }
    var techActive = !!(node && node.kind === 'tech');

    function hoverProps(id) {
      return { onMouseEnter: function () { setHover(id); }, onMouseLeave: function () { setHover(null); }, onFocus: function () { setHover(id); }, onBlur: function () { setHover(null); } };
    }
    function techNode(id) {
      var n = N[id];
      return h('button', Object.assign({ key: id, type: 'button', className: 'fbx-node', 'aria-pressed': selected === id,
        'data-selected': String(active === id), 'data-related': String(!!rel[id] && active !== id),
        'data-dim': String(techActive && active !== id && !rel[id]), onClick: function () { toggle(id); } }, hoverProps(id)),
        h('span', { className: 'fbx-mono-badge', 'aria-hidden': true }, n.mono),
        h('b', null, n.label), h('span', { className: 'fbx-s' }, n.sub));
    }
    function lane(l) {
      return h('section', { className: 'fbx-lane', key: l.key, 'aria-label': l.name },
        h('div', { className: 'fbx-lane-head' }, h('h3', { className: 'fbx-lane-name' }, l.name), h('span', { className: 'fbx-lane-note' }, l.note)),
        h('div', { className: 'fbx-nodes' }, l.ids.map(techNode)));
    }
    function stepBtn(id) {
      var n = N[id];
      return h('button', Object.assign({ key: id, type: 'button', className: 'fbx-step', 'aria-pressed': selected === id,
        'data-selected': String(active === id), 'data-dim': String(!!node && active !== id && node.kind === 'step'), onClick: function () { toggle(id); } }, hoverProps(id)),
        h('span', { className: 'fbx-n' }, 'STEP ' + (n.mono.length < 2 ? '0' + n.mono : n.mono)),
        h('b', null, n.label), h('span', { className: 'fbx-s' }, n.sub));
    }

    var journey = h('div', { className: 'fbx-main', key: 'journey', role: 'tabpanel', id: 'fbx-p-journey' },
      h('p', { className: 'fbx-phase' }, 'Customer journey · hover to preview, click to pin'),
      h('div', { className: 'fbx-steps' }, J.map(function (j) { return stepBtn('j-' + j[0]); })),
      h('div', { className: 'fbx-life' },
        h('div', { className: 'fbx-life-head' },
          h('div', null, h('h3', null, 'The order lifecycle'), h('p', null, 'The critical path from checkout to a row in Excel. Each stage happens on the server, in this order, and the next one waits for the last.')),
          h(Button, { variant: 'gold', size: 'sm', onClick: play }, playing ? 'Playing' : lc >= LCIDS.length ? 'Replay' : 'Play order')),
        h('div', { className: 'fbx-life-track' },
          h('span', { className: 'fbx-life-rail' }),
          h('span', { className: 'fbx-life-fill', style: { width: Math.max(0, Math.min(lc, 4)) * 20 + '%' } }),
          LCIDS.map(function (id, i) {
            var n = N[id];
            var st = lc >= LCIDS.length || i < lc ? 'done' : i === lc ? 'now' : 'idle';
            return h('button', Object.assign({ key: id, type: 'button', className: 'fbx-life-item', 'data-state': st, 'data-selected': String(active === id), 'aria-pressed': selected === id, onClick: function () { toggle(id); } }, hoverProps(id)),
              h('span', { className: 'fbx-life-dot' }, st === 'done' ? '✓' : n.mono),
              h('b', null, n.label), h('span', { className: 'fbx-s' }, n.sub));
          }))));

    var arch = h('div', { className: 'fbx-main', key: 'arch', role: 'tabpanel', id: 'fbx-p-arch' },
      h('p', { className: 'fbx-phase' }, 'Technical architecture · select a component to light up what it talks to'),
      lane(LANES[0]),
      h(Connector, { label: 'Firebase SDK · realtime listeners' }),
      lane(LANES[1]),
      h('div', { className: 'fbx-row2' },
        h('div', null, h(Connector, { label: 'server-side calls + webhooks' }), lane(LANES[2])),
        h('div', null, h(Connector, { label: 'Microsoft Graph REST' }), lane(LANES[3]))));

    var flowCells = [];
    DFIDS.forEach(function (id, i) {
      var n = N[id];
      flowCells.push(h('div', { className: 'fbx-flow-cell', key: id },
        h('button', Object.assign({ type: 'button', className: 'fbx-node', 'aria-pressed': selected === id, 'data-selected': String(active === id), 'data-related': 'false', 'data-dim': String(!!node && node.kind === 'flow' && active !== id), onClick: function () { toggle(id); } }, hoverProps(id)),
          h('span', { className: 'fbx-mono-badge', 'aria-hidden': true }, n.mono), h('b', null, n.label), h('span', { className: 'fbx-s' }, n.sub)),
        i < DFIDS.length - 1 ? h(FlowArrow) : null));
    });
    var flow = h('div', { className: 'fbx-main', key: 'flow', role: 'tabpanel', id: 'fbx-p-flow' },
      h(Callout, { className: 'fbx-principle', title: 'Rule.' }, 'Firebase is the live operational database. Excel is for reporting, analysis and business operations. Data flows one way.'),
      h('p', { className: 'fbx-phase' }, 'Firebase to Excel · six stages'),
      h('div', { className: 'fbx-lane' }, h('div', { className: 'fbx-flow' }, flowCells)),
      h('div', { className: 'fbx-lane fbx-sheets' },
        h('div', { className: 'fbx-lane-head' }, h('h3', { className: 'fbx-lane-name' }, 'FreshBliss_Operations.xlsx'), h('span', { className: 'fbx-lane-note' }, 'What each sheet receives')),
        h('div', { className: 'fbx-sheet-tabs', role: 'tablist', 'aria-label': 'Workbook sheets' },
          Object.keys(SHEETS).map(function (k) {
            return h('button', { key: k, type: 'button', role: 'tab', className: 'fbx-sheet-tab', 'aria-selected': sheet === k, onClick: function () { setSheet(k); } }, k);
          })),
        h('div', { className: 'fbx-cols' }, SHEETS[sheet].map(function (c) { return h('span', { className: 'fbx-col', key: c }, c); }))));

    var tabs = [['journey', 'Customer Journey Flow'], ['arch', 'Technical Architecture'], ['flow', 'Data Flow (Firebase to Excel)']];

    return h('div', { className: 'fb-root fbx' },
      h('div', { className: 'fbx-head' },
        h('div', null,
          h(Badge, null, 'Architecture and system flow'),
          h('h2', { className: 'fbx-title' }, props.title || 'FreshBliss, end to end'),
          h('p', { className: 'fbx-sub' }, props.subtitle || 'Premium fresh-cut fruit delivery for Bengaluru. Firebase runs the shop; Excel reports on it.')),
        h('div', { className: 'fbx-tabs', role: 'tablist', 'aria-label': 'Views' },
          tabs.map(function (t) {
            return h('button', { key: t[0], type: 'button', role: 'tab', className: 'fbx-tab', 'aria-selected': view === t[0], 'aria-controls': 'fbx-p-' + t[0], onClick: function () { switchView(t[0]); } }, t[1]);
          }))),
      h('div', { className: 'fbx-stage', 'data-open': String(!!node), 'data-active': String(!!node) },
        view === 'journey' ? journey : view === 'arch' ? arch : flow,
        h(Panel, { node: shown, pinned: !!selected, onClose: function () { setSelected(null); setHovered(null); setPlaying(false); }, onGo: go })));
  }

  /* ============================================================ storefront */
  var RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function rupee(n) { return '₹' + Number(n).toLocaleString('en-IN'); }
  function clockNow(offsetMin) {
    var d = new Date(Date.now() + (offsetMin || 0) * 60000);
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
  }
  function HeartIcon(p) {
    return h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', 'aria-hidden': true },
      h('path', { d: 'M12 20.5s-7.5-4.6-9.3-9.4C1.5 7.8 3.5 4.5 7 4.5c2 0 3.8 1.2 5 3 1.2-1.8 3-3 5-3 3.5 0 5.5 3.3 4.3 6.6-1.8 4.8-9.3 9.4-9.3 9.4z',
        fill: p.filled ? 'currentColor' : 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinejoin: 'round' }));
  }
  function BagIcon() {
    return h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', 'aria-hidden': true },
      h('path', { d: 'M5 8h14l-1 12H6L5 8zM9 8V6a3 3 0 0 1 6 0v2', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinejoin: 'round', strokeLinecap: 'round' }));
  }
  function CheckIcon() {
    return h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', 'aria-hidden': true },
      h('path', { d: 'M5 12.5l4.5 4.5L19 7.5', fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' }));
  }

  /* image slot: a real <img> when src is given, a labelled slot otherwise */
  function Media(p) {
    return h('div', { className: cx('fbs-media', p.className), style: { aspectRatio: p.ratio || '4 / 3' } },
      p.src ? h('img', { src: p.src, alt: p.alt || '', loading: 'lazy' })
            : h('span', { className: 'fbs-media-ph code' }, p.label || 'Image'));
  }

  function Reveal(p) {
    var ref = useRef(null);
    var rm = useReduced(); var st = useState(rm), on = st[0], setOn = st[1];
    useEffect(function () {
      var el = ref.current;
      if (rm || !el || !('IntersectionObserver' in window)) { setOn(true); return undefined; }
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { setOn(true); io.disconnect(); } });
      }, { threshold: 0.12 });
      io.observe(el);
      return function () { io.disconnect(); };
    }, [rm]);
    return h('div', { ref: ref, className: cx('fbs-reveal', on && 'is-in', p.className), style: { transitionDelay: (p.delay || 0) + 'ms' } }, p.children);
  }

  /* ------------------------------------------------------------ ProductCard */
  function ProductCard(p) {
    var imgs = (p.images || []).slice(0, 4);
    var slots = Math.min(4, Math.max(2, imgs.length || p.slots || 3));
    var si = useState(0), idx = si[0], setIdx = si[1];
    var sw = useState(!!p.wishlisted), wished = sw[0], setWished = sw[1];
    useEffect(function () { if (typeof p.wishlisted === 'boolean') setWished(p.wishlisted); }, [p.wishlisted]);
    var inStock = p.stock === undefined || p.stock > 0;
    var low = inStock && p.stock !== undefined && p.stock <= 5;
    function toggleWish() {
      var next = !wished; setWished(next);
      if (p.onWishlist) p.onWishlist(p.id, next);
    }
    var dots = [];
    for (var i = 0; i < slots; i++) (function (n) {
      dots.push(h('button', { key: n, type: 'button', className: 'fbs-dot', 'aria-label': 'Show image ' + (n + 1) + ' of ' + slots, 'aria-current': idx === n,
        onMouseEnter: function () { setIdx(n); }, onFocus: function () { setIdx(n); }, onClick: function () { setIdx(n); } }));
    })(i);
    return h('article', { className: cx('fbs-pc', !inStock && 'is-out', p.className), 'aria-label': p.name },
      h('div', { className: 'fbs-pc-media' },
        h(Media, { src: imgs[idx], alt: p.name + ' image ' + (idx + 1), label: 'IMAGE ' + (idx + 1) + ' OF ' + slots, ratio: '4 / 3' }),
        p.badge ? h('span', { className: 'fbs-pc-badge label' }, p.badge) : null,
        h('button', { type: 'button', className: 'fbs-wish', 'aria-pressed': wished, 'aria-label': (wished ? 'Remove ' : 'Add ') + p.name + (wished ? ' from wishlist' : ' to wishlist'), onClick: toggleWish }, h(HeartIcon, { filled: wished })),
        !inStock ? h('span', { className: 'fbs-pc-out heading-3' }, 'Out of stock') : null,
        h('div', { className: 'fbs-dots', role: 'group', 'aria-label': 'Product images' }, dots)),
      h('div', { className: 'fbs-pc-body' },
        h('h3', { className: 'fbs-pc-name heading-3' }, p.name),
        h('p', { className: 'fbs-pc-desc small' }, p.description),
        low ? h('p', { className: 'fbs-pc-low small', 'aria-live': 'polite' }, 'Only ' + p.stock + ' left') : null,
        h('div', { className: 'fbs-pc-foot' },
          h('span', { className: 'fbs-pc-price kpi' }, rupee(p.price)),
          h(Button, { variant: 'gold', size: 'sm', disabled: !inStock, onClick: function () { if (p.onAdd) p.onAdd(p); } }, inStock ? 'Add to Cart' : 'Unavailable'))));
  }

  /* ------------------------------------------------------------ HomeScreen */
  var DEFAULT_PRODUCTS = [
    { id: 'classic-fresh-mix', name: 'Classic Fresh Mix', description: 'Watermelon, Pineapple, Grapes, Kiwi', price: 149, badge: 'Popular', category: 'Fresh', stock: 25 },
    { id: 'tropical-bliss', name: 'Tropical Bliss', description: 'Mango, Pineapple, Papaya, Kiwi', price: 179, badge: 'New', category: 'Fresh', stock: 18 },
    { id: 'gym-fuel-pack', name: 'Gym Fuel Pack', description: 'Apple, Banana, Berries, Nuts', price: 159, badge: 'Fitness', category: 'Fitness', stock: 4 },
    { id: 'ramadan-special-box', name: 'Ramadan Special Box', description: 'Dates, Fruits, Pomegranate, Mixed', price: 199, badge: 'Limited', category: 'Ramadan', stock: 12 }
  ];
  var DEFAULT_CATEGORIES = ['Fresh', 'Fitness', 'Ramadan', 'Family', 'Office', 'Seasonal'];
  var PROMISES = [['0-5', 'Order accepted', 'Order validated and sent to preparation.'], ['5-20', 'Preparation', 'Fruit cutting and quality check.'], ['20-40', 'Packing and pickup', 'Pack and hand over to delivery.'], ['40-60', 'Delivery', 'Customer receives order.']];

  function HomeScreen(p) {
    var products = p.products || DEFAULT_PRODUCTS;
    var categories = p.categories || DEFAULT_CATEGORIES;
    var ramadan = p.ramadan !== false;
    var sc = useState('All'), cat = sc[0], setCat = sc[1];
    var sq = useState(''), query = sq[0], setQuery = sq[1];
    var sw = useState({}), wish = sw[0], setWish = sw[1];
    var heroRef = useRef(null), prodRef = useRef(null);
    var rmH = useReduced();
    useEffect(function () {
      if (rmH) return undefined;
      var raf = 0;
      function onScroll() {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function () {
          var el = heroRef.current; if (!el) return;
          var y = Math.min(window.pageYOffset || 0, 800);
          el.style.setProperty('--py', (y * 0.22).toFixed(1) + 'px');
          el.style.setProperty('--pf', (y * 0.08).toFixed(1) + 'px');
        });
      }
      window.addEventListener('scroll', onScroll, { passive: true });
      return function () { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
    }, [rmH]);
    var qn = query.trim().toLowerCase();
    var shown = products.filter(function (x) { return (cat === 'All' || x.category === cat) && (!qn || (x.name + ' ' + x.description).toLowerCase().indexOf(qn) >= 0); });
    var wishCount = Object.keys(wish).filter(function (k) { return wish[k]; }).length;
    function shop() { if (p.onShop) p.onShop(); if (prodRef.current && prodRef.current.scrollIntoView) prodRef.current.scrollIntoView({ behavior: isReduced() ? 'auto' : 'smooth', block: 'start' }); }
    function count(c) { return products.filter(function (x) { return x.category === c; }).length; }
    var links = ['Home', 'Products', 'About', 'Track Order'];

    return h('div', { className: 'fb-root fbs-home' },
      h('nav', { className: 'fbs-nav', 'aria-label': 'Primary' },
        h('div', { className: 'fbs-wrap fbs-nav-in' },
          h('div', { className: 'fbs-brand' }, h('span', { className: 'fbs-wordmark' }, 'FreshBliss'), h('span', { className: 'fbs-tagline small' }, 'Freshness Delivered')),
          h('div', { className: 'fbs-links' }, links.map(function (l) {
            return h('button', { key: l, type: 'button', className: 'fbs-link nav-link', onClick: function () { if (l === 'Products') shop(); else if (p.onNavigate) p.onNavigate(l); } }, l);
          })),
          h('div', { className: 'fbs-actions' },
            h('span', { className: 'fbs-icon-btn', role: 'img', 'aria-label': wishCount + ' items in wishlist' }, h(HeartIcon, { filled: wishCount > 0 }), wishCount ? h('span', { className: 'fbs-count' }, wishCount) : null),
            h('span', { className: 'fbs-icon-btn', role: 'img', 'aria-label': (p.cartCount || 0) + ' items in cart' }, h(BagIcon), p.cartCount ? h('span', { className: 'fbs-count' }, p.cartCount) : null),
            h(Button, { variant: 'outline', size: 'sm', onClick: p.onLogin }, 'Login / Sign Up')))),

      h('header', { className: 'fbs-hero', ref: heroRef },
        h('div', { className: 'fbs-hero-bg', 'aria-hidden': true }, h('span', { className: 'fbs-disc fbs-disc-a' }), h('span', { className: 'fbs-disc fbs-disc-b' })),
        h('div', { className: 'fbs-wrap fbs-hero-in' },
          h('div', { className: 'fbs-hero-copy' },
            ramadan ? h(Badge, { tone: 'onDark' }, 'Ramadan Special') : h(Badge, { tone: 'onDark' }, 'Premium fresh-cut fruit'),
            h('h1', { className: 'fbs-hero-title display' }, 'Fresh Fruits,', h('br'), h('span', { className: 'fbs-gold' }, 'Healthier You')),
            h('p', { className: 'fbs-hero-lead lead' }, 'Premium sliced and packed fruit boxes for your daily freshness.'),
            h('ul', { className: 'fbs-trust small' }, ['Fresh and Hygienic', '1 Hour Delivery (Bangalore)', 'Healthy Living'].map(function (t) { return h('li', { key: t }, h('span', { className: 'fbs-tick' }, h(CheckIcon)), t); })),
            h(Button, { variant: 'gold', onClick: shop }, 'Shop Now'),
            h(DeliveryChecker, { tone: 'onDark', className: 'fbs-hero-check', check: p.checkDelivery, onResult: p.onDeliveryResult })),
          h('div', { className: 'fbs-hero-art' },
            h(Media, { src: p.heroImage, alt: 'Fresh fruit box', label: 'HERO IMAGE · FRUIT BOX', ratio: '1 / 1', className: 'fbs-hero-media' })))),

      h('main', { id: 'fbs-main', tabIndex: -1 },
        h('section', { className: 'fbs-section', 'aria-labelledby': 'fbs-cat-h' },
          h('div', { className: 'fbs-wrap' },
            h(Reveal, null, h('h2', { id: 'fbs-cat-h', className: 'heading-2 fbs-h2' }, 'Shop by category'), h('p', { className: 'fbs-sub body' }, 'Freshly sliced. Perfectly packed. Always.')),
            h('div', { className: 'fbs-cats', role: 'tablist', 'aria-label': 'Categories' },
              ['All'].concat(categories).map(function (c, i) {
                var n = c === 'All' ? products.length : count(c);
                return h(Reveal, { key: c, delay: i * 50 },
                  h('button', { type: 'button', role: 'tab', className: 'fbs-cat', 'aria-selected': cat === c, onClick: function () { setCat(c); } },
                    h('span', { className: 'fbs-cat-mono code', 'aria-hidden': true }, c.slice(0, 2).toUpperCase()),
                    h('span', { className: 'fbs-cat-name nav-link' }, c),
                    h('span', { className: 'fbs-cat-n small' }, n + (n === 1 ? ' box' : ' boxes'))));
              })))),

        h('section', { className: 'fbs-section fbs-section-tight', id: 'fbs-products', ref: prodRef, 'aria-labelledby': 'fbs-box-h' },
          h('div', { className: 'fbs-wrap' },
            h(Reveal, null, h('div', { className: 'fbs-row' }, h('div', null, h('h2', { id: 'fbs-box-h', className: 'heading-2 fbs-h2' }, 'Our Fruit Boxes'), h('p', { className: 'fbs-sub body' }, cat === 'All' ? 'Freshly sliced. Perfectly packed. Always.' : cat + ' boxes')), h('div', { className: 'fbs-search' }, h('label', { className: 'fbs-sr', htmlFor: 'fbs-q' }, 'Search fruit boxes'), h('input', { id: 'fbs-q', type: 'search', className: 'fbd-in body', value: query, placeholder: 'Search boxes or fruits', onChange: function (x) { setQuery(x.target.value); } }), h('span', { className: 'small fbs-muted', role: 'status' }, shown.length + ' of ' + products.length)))),
            shown.length ? h('div', { className: 'fbs-grid', key: cat }, shown.map(function (x, i) {
              return h(Reveal, { key: x.id, delay: i * 70 }, h(ProductCard, Object.assign({}, x, {
                wishlisted: !!wish[x.id],
                onWishlist: function (id, next) { var o = Object.assign({}, wish); o[id] = next; setWish(o); if (p.onWishlist) p.onWishlist(id, next); },
                onAdd: p.onAddToCart })));
            })) : h(Callout, { title: qn ? 'No matches.' : 'Coming soon.' }, qn ? 'Nothing matches "' + query + '". Try a fruit like mango or a box name.' : 'No ' + cat + ' boxes yet. Categories are data, so new ones appear here as soon as they are added.'))),

        h('section', { className: 'fbs-section fbs-promise', 'aria-labelledby': 'fbs-p-h' },
          h('div', { className: 'fbs-wrap' },
            h(Reveal, null, h('h2', { id: 'fbs-p-h', className: 'heading-2 fbs-h2' }, 'One hour, door to door'), h('p', { className: 'fbs-sub body' }, 'Minutes from order to doorstep, based on our preparation and delivery capacity.')),
            h('div', { className: 'fbs-promise-grid' }, PROMISES.map(function (x, i) {
              return h(Reveal, { key: x[0], delay: i * 80 }, h(Stat, { value: x[0], label: x[1], note: x[2] }));
            }))))),

      p.support === false ? null : h(SupportButton, { phone: p.supportPhone, onHelp: p.onHelp }),
      h('footer', { className: 'fbs-footer' },
        h('div', { className: 'fbs-wrap' },
          h('div', { className: 'fbs-wordmark fbs-wordmark-lg' }, 'FreshBliss'),
          h('p', { className: 'fbs-foot-line' }, 'Freshness · Health · Convenience · Always'),
          h('p', { className: 'small fbs-foot-small' }, 'Premium fresh-cut fruit delivery, Bengaluru.'))));
  }

  /* ------------------------------------------------------------ delivery-app essentials */
  function copyText(t) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(function () { return true; }, function () { return false; }); } catch (e) { /* fall through */ }
    return Promise.resolve(false);
  }
  function useFlash(ms) {
    var s = useState(false), on = s[0], set = s[1];
    useEffect(function () { if (!on) return undefined; var t = setTimeout(function () { set(false); }, ms || 2000); return function () { clearTimeout(t); }; }, [on]);
    return [on, function () { set(true); }];
  }
  function LinkButton(p) {
    return h('a', { className: cx('fb-btn', 'fb-btn--' + (p.variant || 'outline'), p.size === 'sm' && 'fb-btn--sm', p.className), href: p.href, target: p.external ? '_blank' : undefined, rel: p.external ? 'noopener noreferrer' : undefined }, p.children);
  }
  function ShareIcon() {
    return h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', 'aria-hidden': true },
      h('path', { d: 'M12 15V4M8 8l4-4 4 4M5 13v6h14v-6', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }));
  }
  function ShareButton(p) {
    var f = useFlash(2200), done = f[0], flash = f[1];
    function go() {
      var url = p.url || (window.location && window.location.href) || '';
      if (navigator.share) { navigator.share({ title: p.title, text: p.text, url: url }).catch(function () { /* dismissed */ }); return; }
      copyText(url).then(function (ok) { if (ok) flash(); if (p.onShare) p.onShare(url, ok); });
    }
    return h(Button, { variant: 'outline', size: 'sm', onClick: go, className: p.className }, h(ShareIcon), done ? 'Link copied' : (p.label || 'Share'));
  }

  function StarIcon(p) {
    return h('svg', { width: 28, height: 28, viewBox: '0 0 24 24', 'aria-hidden': true },
      h('path', { d: 'M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1L3.2 9.6l6.1-.8L12 3.2z', fill: p.on ? 'currentColor' : 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinejoin: 'round' }));
  }
  function StarRating(p) {
    return h('fieldset', { className: 'fbf-fs' }, h('legend', { className: 'nav-link fbf-legend' }, p.label),
      h('div', { className: 'fbf-stars' }, [1, 2, 3, 4, 5].map(function (n) {
        return h('label', { key: n, className: 'fbf-star' },
          h('input', { type: 'radio', name: p.name, value: n, checked: p.value === n, onChange: function () { p.onChange(n); } }),
          h('span', { className: 'fbf-star-i', 'data-on': String(p.value >= n) }, h(StarIcon, { on: p.value >= n })),
          h('span', { className: 'fbs-sr' }, n + ' of 5 stars'));
      })));
  }
  function FeedbackForm(p) {
    var a = useState(0), overall = a[0], setOverall = a[1];
    var b = useState(0), pack = b[0], setPack = b[1];
    var c = useState(0), deliv = c[0], setDeliv = c[1];
    var d = useState(''), note = d[0], setNote = d[1];
    var e = useState(false), sent = e[0], setSent = e[1];
    if (sent) return h(Callout, { title: 'Thank you.' }, 'Your feedback helps us keep every box fresh.');
    function submit(ev) { ev.preventDefault(); if (!overall) return; setSent(true); if (p.onSubmit) p.onSubmit({ orderId: p.orderId, overall: overall, packaging: pack || null, delivery: deliv || null, comment: note.trim() }); }
    return h('form', { className: 'fbf', onSubmit: submit, noValidate: true },
      h(StarRating, { name: 'fbf-o', label: 'Overall experience', value: overall, onChange: setOverall }),
      h(StarRating, { name: 'fbf-p', label: 'Packaging', value: pack, onChange: setPack }),
      h(StarRating, { name: 'fbf-d', label: 'Delivery', value: deliv, onChange: setDeliv }),
      h('label', { className: 'fbf-lab nav-link', htmlFor: 'fbf-note' }, 'Comments (optional)'),
      h('textarea', { id: 'fbf-note', className: 'fbf-ta body', rows: 3, maxLength: 300, value: note, placeholder: 'Fresh and tasty? Tell us what you loved or what to fix.', onChange: function (x) { setNote(x.target.value); } }),
      h('div', { className: 'fbf-foot' }, h('span', { className: 'small fbs-muted' }, note.length + '/300'),
        h(Button, { variant: 'gold', size: 'sm', type: 'submit', disabled: !overall }, 'Submit feedback')),
      !overall ? h('p', { className: 'small fbs-muted fbf-hint' }, 'Choose an overall rating to submit.') : null);
  }

  /* delivery pincode check. demo rule only: replace with the deliveryZones lookup (Google Maps) via `check` */
  function demoCheck(pin) {
    if (!/^\d{6}$/.test(pin)) return { serviceable: false, message: 'Enter a 6-digit pincode.' };
    if (pin.indexOf('5600') === 0) return { serviceable: true, zone: 'Zone A', fee: 0, eta: '30 to 45 min', message: 'Delivering to ' + pin + ': Zone A, free delivery, about 30 to 45 min.' };
    if (pin.indexOf('560') === 0) return { serviceable: true, zone: 'Zone B', fee: 30, eta: '45 to 60 min', message: 'Delivering to ' + pin + ': Zone B, delivery ' + rupee(30) + ', about 45 to 60 min.' };
    return { serviceable: false, message: 'Sorry, we do not deliver to ' + pin + ' yet. We start in Bengaluru.' };
  }
  function DeliveryChecker(p) {
    var s = useState(p.initialPin || ''), pin = s[0], setPin = s[1];
    var r = useState(null), res = r[0], setRes = r[1];
    var bz = useState(false), busy = bz[0], setBusy = bz[1];
    function go(ev) {
      ev.preventDefault(); setBusy(true);
      Promise.resolve((p.check || demoCheck)(pin)).then(function (out) { setRes(out); setBusy(false); if (p.onResult) p.onResult(out.serviceable ? Object.assign({ pincode: pin }, out) : null); });
    }
    return h('form', { className: cx('fbd', p.tone === 'onDark' && 'fbd--dark', p.className), onSubmit: go, noValidate: true },
      h('label', { className: 'fbd-lab nav-link', htmlFor: 'fbd-pin' }, p.label || 'Check delivery to your pincode'),
      h('div', { className: 'fbd-row' },
        h('input', { id: 'fbd-pin', className: 'fbd-in body', inputMode: 'numeric', autoComplete: 'postal-code', maxLength: 6, value: pin, placeholder: 'e.g. 560041', 'aria-describedby': 'fbd-out', onChange: function (x) { setPin(x.target.value.replace(/\D/g, '')); } }),
        h(Button, { variant: p.tone === 'onDark' ? 'gold' : 'primary', size: 'sm', type: 'submit', disabled: busy || pin.length < 6 }, busy ? 'Checking' : 'Check')),
      h('p', { id: 'fbd-out', className: cx('small fbd-out', res && (res.serviceable ? 'is-ok' : 'is-no')), role: 'status' }, res ? [h('strong', { key: 's' }, res.serviceable ? 'Available. ' : 'Not available. '), res.message] : ''));
  }

  function SupportButton(p) {
    var s = useState(false), open = s[0], setOpen = s[1];
    var ref = useRef(null);
    var wa = p.phone ? 'https://wa.me/' + String(p.phone).replace(/\D/g, '') + '?text=' + encodeURIComponent(p.message || 'Hi FreshBliss, I need help with my order.') : null;
    function onKey(e) { if (e.key === 'Escape') { setOpen(false); var b = ref.current && ref.current.querySelector('.fbh-fab'); if (b) b.focus(); } }
    function act(kind) { setOpen(false); if (p.onHelp) p.onHelp(kind); }
    return h('div', { className: cx('fbh', p.className), ref: ref, onKeyDown: onKey },
      open ? h('div', { className: 'fbh-menu', role: 'group', 'aria-label': 'Get help' },
        h('p', { className: 'small fbs-muted fbh-hours' }, p.hours || 'Usually replies within a few minutes'),
        wa ? h(LinkButton, { href: wa, external: true, variant: 'primary', size: 'sm' }, 'Chat on WhatsApp') : h(Button, { variant: 'primary', size: 'sm', onClick: function () { act('whatsapp'); } }, 'Chat on WhatsApp'),
        p.phone ? h(LinkButton, { href: 'tel:+' + String(p.phone).replace(/\D/g, ''), size: 'sm' }, 'Call us') : h(Button, { variant: 'outline', size: 'sm', onClick: function () { act('call'); } }, 'Call us'),
        h(Button, { variant: 'outline', size: 'sm', onClick: function () { act('faq'); } }, 'Read FAQs')) : null,
      h('button', { type: 'button', className: 'fbh-fab nav-link', 'aria-expanded': open, onClick: function () { setOpen(!open); } },
        h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', 'aria-hidden': true }, h('path', { d: 'M4 5h16v11H9l-5 4V5z', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinejoin: 'round' })), open ? 'Close' : 'Help'));
  }

  function NotifyMe(p) {
    var s = useState(false), on = s[0], setOn = s[1];
    function go() { setOn(true); if (p.onNotify) p.onNotify(p.product); }
    return on ? h(Callout, { className: 'fbs-pd-note', title: 'You are on the list.' }, 'We will tell you as soon as ' + (p.product && p.product.name || 'this box') + ' is back.')
      : h('div', { className: 'fbs-pd-notify' }, h(Button, { variant: 'primary', onClick: go }, 'Notify me when back'), h('span', { className: 'small fbs-muted' }, 'No payment now.'));
  }

  /* ------------------------------------------------------------ Cart */
  function Cart(p) {
    var st = useState(p.items || []), items = st[0], setItems = st[1];
    var sp = useState(''), promoIn = sp[0], setPromoIn = sp[1];
    var sa = useState(null), promo = sa[0], setPromo = sa[1];
    var sm = useState(''), promoMsg = sm[0], setPromoMsg = sm[1];
    var sn = useState(''), note = sn[0], setNote = sn[1];
    var sti = useState(0), tip = sti[0], setTip = sti[1];
    var sz = useState(null), zone = sz[0], setZone = sz[1];
    var sc = useState(false), confirmClear = sc[0], setConfirmClear = sc[1];
    useEffect(function () { if (p.items) setItems(p.items); }, [p.items]);
    useEffect(function () { if (!confirmClear) return undefined; var t = setTimeout(function () { setConfirmClear(false); }, 3500); return function () { clearTimeout(t); }; }, [confirmClear]);
    var subtotal = items.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
    var fee = zone ? zone.fee : (p.deliveryFee || 0);
    var promoOff = 0;
    if (promo) promoOff = promo.type === 'percent' ? Math.round(subtotal * promo.value / 100) : Math.min(promo.value, subtotal);
    var discount = (p.discount || 0) + promoOff;
    var tips = p.tips || [0, 10, 20, 30];
    var total = Math.max(0, subtotal + fee + (p.tips === false ? 0 : tip) - discount);
    var freeFrom = p.freeDeliveryFrom, toFree = freeFrom ? Math.max(0, freeFrom - subtotal) : 0;
    function commit(next) { setItems(next); if (p.onChange) p.onChange(next); }
    function setQty(id, q) { commit(items.map(function (i) { return i.id === id ? Object.assign({}, i, { qty: Math.max(1, Math.min(i.stock || 99, q)) }) : i; })); }
    function remove(id) { commit(items.filter(function (i) { return i.id !== id; })); }
    function toWish(i) { if (p.onWishlist) p.onWishlist(i.id, true); remove(i.id); }
    function applyPromo(ev) {
      ev.preventDefault();
      var code = promoIn.trim().toUpperCase(); if (!code) return;
      Promise.resolve(p.onApplyPromo ? p.onApplyPromo(code, subtotal) : (function () {
        var c = (p.promoCodes || {})[code];
        if (!c) return { ok: false, message: 'That code is not valid.' };
        if (c.min && subtotal < c.min) return { ok: false, message: 'Add ' + rupee(c.min - subtotal) + ' more to use ' + code + '.' };
        return { ok: true, type: c.type, value: c.value, message: code + ' applied.' };
      })()).then(function (r) { if (r.ok) { setPromo({ code: code, type: r.type, value: r.value }); } else setPromo(null); setPromoMsg(r.message || ''); });
    }
    function clearPromo() { setPromo(null); setPromoMsg('Code removed.'); setPromoIn(''); }
    if (!items.length) {
      return h('section', { className: 'fb-root fbs-cart fbs-cart-empty', 'aria-label': 'Your cart' },
        h('h2', { className: 'heading-2 fbs-h2' }, 'Your cart is empty'),
        h('p', { className: 'body fbs-sub' }, 'Add a fruit box and it will wait for you here.'),
        h(Button, { variant: 'outline', onClick: p.onContinue }, 'Continue shopping'));
    }
    var hasPromo = !!(p.promoCodes || p.onApplyPromo);
    return h('section', { className: 'fb-root fbs-cart', 'aria-label': 'Your cart' },
      h('div', { className: 'fbs-cart-head' },
        h('h2', { className: 'heading-2 fbs-h2' }, 'Your Cart'),
        h('div', { className: 'fbs-cart-tools' },
          p.onContinue ? h('button', { type: 'button', className: 'fbs-remove small', onClick: p.onContinue }, 'Continue shopping') : null,
          h('button', { type: 'button', className: cx('fbs-remove small', confirmClear && 'is-danger'), onClick: function () { if (confirmClear) { commit([]); setConfirmClear(false); } else setConfirmClear(true); } }, confirmClear ? 'Tap again to clear cart' : 'Clear cart'))),
      freeFrom ? h('div', { className: 'fbs-free' },
        h('p', { className: 'small fbs-free-t', role: 'status' }, toFree > 0 ? 'Add ' + rupee(toFree) + ' more for free delivery' : 'You have free delivery'),
        h('div', { className: 'fbs-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': freeFrom, 'aria-valuenow': Math.min(subtotal, freeFrom), 'aria-label': 'Progress to free delivery' }, h('span', { style: { width: Math.min(100, subtotal / freeFrom * 100) + '%' } }))) : null,
      h('div', { className: 'fbs-cart-grid' },
        h('ul', { className: 'fbs-lines' }, items.map(function (i) {
          return h('li', { key: i.id, className: 'fbs-line' },
            h(Media, { src: i.image, alt: i.name, label: 'IMG', ratio: '1 / 1', className: 'fbs-line-img' }),
            h('div', { className: 'fbs-line-main' },
              h('h3', { className: 'heading-3 fbs-line-name' }, i.name),
              i.detail ? h('p', { className: 'small fbs-muted' }, i.detail) : null,
              h('div', { className: 'fbs-line-ctl' },
                h('div', { className: 'fbs-step', role: 'group', 'aria-label': 'Quantity for ' + i.name },
                  h('button', { type: 'button', 'aria-label': 'Decrease quantity', disabled: i.qty <= 1, onClick: function () { setQty(i.id, i.qty - 1); } }, '−'),
                  h('output', { 'aria-live': 'polite' }, i.qty),
                  h('button', { type: 'button', 'aria-label': 'Increase quantity', disabled: i.qty >= (i.stock || 99), onClick: function () { setQty(i.id, i.qty + 1); } }, '+')),
                p.onWishlist ? h('button', { type: 'button', className: 'fbs-remove small', onClick: function () { toWish(i); } }, 'Save for later') : null,
                h('button', { type: 'button', className: 'fbs-remove small', 'aria-label': 'Remove ' + i.name, onClick: function () { remove(i.id); } }, 'Remove'))),
            h('div', { className: 'fbs-line-price kpi' }, rupee(i.price * i.qty)));
        }).concat([h('li', { key: '__note', className: 'fbs-notecard' },
          h('label', { className: 'nav-link', htmlFor: 'fbs-note' }, 'Delivery instructions (optional)'),
          h('textarea', { id: 'fbs-note', className: 'fbf-ta body', rows: 2, maxLength: 200, value: note, placeholder: 'Gate code, landmark, leave at the door, call on arrival', onChange: function (x) { setNote(x.target.value); } }),
          h('p', { className: 'small fbs-muted' }, note.length + '/200'))])),
        h('aside', { className: 'fbs-summary', 'aria-label': 'Order summary' },
          h(Card, { title: 'Order summary' },
            p.showDeliveryCheck === false ? null : h(DeliveryChecker, { className: 'fbd--cart', onResult: setZone, check: p.checkDelivery, label: 'Delivery pincode' }),
            hasPromo ? h('div', { className: 'fbs-promo' },
              promo ? h('div', { className: 'fbs-promo-on' }, h(Tag, null, promo.code), h('span', { className: 'small' }, 'saves ' + rupee(promoOff)), h('button', { type: 'button', className: 'fbs-remove small', onClick: clearPromo }, 'Remove'))
                : h('form', { onSubmit: applyPromo, className: 'fbd-row', noValidate: true },
                  h('label', { className: 'fbs-sr', htmlFor: 'fbs-promo' }, 'Promo code'),
                  h('input', { id: 'fbs-promo', className: 'fbd-in body', value: promoIn, placeholder: 'Promo code', autoCapitalize: 'characters', onChange: function (x) { setPromoIn(x.target.value); } }),
                  h(Button, { variant: 'outline', size: 'sm', type: 'submit', disabled: !promoIn.trim() }, 'Apply')),
              h('p', { className: 'small fbs-muted', role: 'status' }, promoMsg)) : null,
            p.tips === false ? null : h('fieldset', { className: 'fbs-tip' }, h('legend', { className: 'nav-link' }, 'Tip your rider'),
              h('div', { className: 'fba-opts' }, tips.map(function (t) {
                return h('label', { key: t, className: 'fba-opt' }, h('input', { type: 'radio', name: 'fbs-tip', checked: tip === t, onChange: function () { setTip(t); } }), h('span', { className: 'nav-link' }, t ? rupee(t) : 'No tip'));
              }))),
            h('dl', { className: 'fbs-totals' },
              h('div', null, h('dt', null, 'Subtotal'), h('dd', null, rupee(subtotal))),
              h('div', null, h('dt', null, 'Delivery' + (zone ? ' (' + zone.zone + ')' : ' (within 1 hour)')), h('dd', null, fee ? rupee(fee) : 'Free')),
              tip && p.tips !== false ? h('div', null, h('dt', null, 'Rider tip'), h('dd', null, rupee(tip))) : null,
              discount ? h('div', null, h('dt', null, 'Discount'), h('dd', null, '−' + rupee(discount))) : null,
              h('div', { className: 'fbs-total' }, h('dt', null, 'Total'), h('dd', { className: 'kpi' }, rupee(total)))),
            h(Button, { variant: 'gold', className: 'fbs-block', onClick: function () { if (p.onCheckout) p.onCheckout(total, { note: note, tip: tip, promo: promo && promo.code, pincode: zone && zone.pincode, zone: zone && zone.zone }); } }, 'Proceed to Checkout'),
            h(Callout, { className: 'fbs-note' }, 'Totals are a preview. Prices and stock are confirmed on the server at checkout.')))));
  }

  /* ------------------------------------------------------------ OrderTracking */
  var STATUSES = [['PAYMENT_CONFIRMED', 'Order Confirmed', 'Payment verified'], ['PREPARING', 'Preparing', 'Fruit cutting and quality check'], ['PACKED', 'Packed', 'Sealed and ready for pickup'], ['OUT_FOR_DELIVERY', 'Out for Delivery', 'On the way to you'], ['DELIVERED', 'Delivered', 'Enjoy your fruit']];
  function sIndex(k) { for (var i = 0; i < STATUSES.length; i++) if (STATUSES[i][0] === k) return i; return -1; }

  function OrderTracking(p) {
    var o0 = p.order || {};
    var so = useState(o0), order = so[0], setOrder = so[1];
    var sl = useState(false), live = sl[0], setLive = sl[1];
    useEffect(function () { setOrder(p.order || {}); }, [p.order]);
    /* real-time feed: subscribe(orderId, onUpdate) => unsubscribe (Firestore onSnapshot shape); simulate runs a demo feed */
    useEffect(function () {
      var sub = p.subscribe;
      if (!sub && p.simulate) {
        sub = function (id, cb) {
          var i = Math.max(0, sIndex(o0.status || 'PAYMENT_CONFIRMED')), eta = o0.etaMinutes || 18, ts = {};
          var t = setInterval(function () {
            if (i < STATUSES.length - 1) { i += 1; ts = {}; ts[STATUSES[i][0]] = clockNow(); cb({ status: STATUSES[i][0], timestamps: ts, etaMinutes: STATUSES[i][0] === 'DELIVERED' ? 0 : eta }); }
            else clearInterval(t);
            if (STATUSES[i][0] === 'OUT_FOR_DELIVERY') { eta = Math.max(2, eta - 4); cb({ etaMinutes: eta }); }
          }, 2600);
          return function () { clearInterval(t); };
        };
      }
      if (!sub) { setLive(false); return undefined; }
      setLive(true);
      var un = sub(o0.id, function (patch) {
        setOrder(function (o) { if (o.status === 'CANCELLED') return o; return Object.assign({}, o, patch, { timestamps: Object.assign({}, o.timestamps, patch.timestamps) }); });
      });
      return function () { setLive(false); if (typeof un === 'function') un(); };
    }, [p.subscribe, p.simulate, o0.id]);

    var cancelled = order.status === 'CANCELLED';
    var idx = sIndex(order.status);
    var eta = order.etaMinutes;
    var total = o0.etaTotal || o0.etaMinutes || 18;
    var delivered = order.status === 'DELIVERED';
    var headline = cancelled ? 'Order cancelled' : delivered ? 'Delivered' : eta != null ? 'Arriving in ' + eta + ' min' : idx === 3 ? 'Out for delivery' : 'Preparing your order';
    var progress = idx >= 3 ? (delivered ? 1 : Math.min(0.96, Math.max(0.08, 1 - (eta || 0) / total))) : 0;

    var pathRef = useRef(null);
    var sp = useState({ x: 48, y: 156 }), pt = sp[0], setPt = sp[1];
    useEffect(function () {
      var el = pathRef.current; if (!el || !el.getTotalLength) return;
      var q = el.getPointAtLength(el.getTotalLength() * progress); setPt({ x: q.x, y: q.y });
    }, [progress]);

    var cfs = useState(false), confirming = cfs[0], setConfirming = cfs[1];
    var rs = useState('Changed my mind'), reason = rs[0], setReason = rs[1];
    var cpf = useFlash(2000), copied = cpf[0], flashCopied = cpf[1];
    var canCancel = !cancelled && !delivered && idx >= 0 && idx <= 1;
    var rider = order.rider;
    function doCancel() {
      setConfirming(false);
      setOrder(function (o) { return Object.assign({}, o, { status: 'CANCELLED', cancelReason: 'You cancelled this order (' + reason + '). Any payment is refunded to the original method.' }); });
      if (p.onCancel) p.onCancel(order.id, reason);
    }
    var actions = h(Card, { title: 'Help and actions', className: 'fbs-actions-card' },
      idx === 3 && order.pin ? h('div', { className: 'fbs-pinbox' }, h('span', { className: 'small' }, 'Give this code to your rider'), h('strong', { className: 'fbs-pincode code', 'aria-label': 'Delivery code ' + String(order.pin).split('').join(' ') }, order.pin)) : null,
      rider && idx >= 3 && !delivered ? h('div', { className: 'fbs-rider-card' },
        h('div', null, h('p', { className: 'nav-link fbs-rider-name' }, rider.name), h('p', { className: 'small fbs-muted' }, [rider.vehicle, 'Your delivery partner'].filter(Boolean).join(' \u00B7 '))),
        rider.phone ? h('div', { className: 'fbs-act' }, h(LinkButton, { href: 'tel:' + rider.phone, variant: 'primary', size: 'sm' }, 'Call rider'), h(LinkButton, { href: 'sms:' + rider.phone, size: 'sm' }, 'Message')) : null) : null,
      h('div', { className: 'fbs-act' },
        h(ShareButton, { label: 'Share tracking', title: 'FreshBliss order #' + order.id, text: 'Track my FreshBliss order', url: p.shareUrl }),
        h(Button, { variant: 'outline', size: 'sm', onClick: function () { copyText(String(order.id)).then(function (ok) { if (ok) flashCopied(); }); } }, copied ? 'Copied' : 'Copy order ID'),
        h(Button, { variant: 'outline', size: 'sm', onClick: function () { if (p.onHelp) p.onHelp(order.id); } }, 'Get help'),
        canCancel && !confirming ? h(Button, { variant: 'outline', size: 'sm', className: 'fbs-danger', onClick: function () { setConfirming(true); } }, 'Cancel order') : null),
      confirming ? h('div', { className: 'fbs-confirm', role: 'alertdialog', 'aria-labelledby': 'fbs-cf-t' },
        h('p', { id: 'fbs-cf-t', className: 'nav-link' }, 'Cancel this order?'),
        h('label', { className: 'small', htmlFor: 'fbs-cf-r' }, 'Reason'),
        h('select', { id: 'fbs-cf-r', className: 'fbd-in body', value: reason, onChange: function (x) { setReason(x.target.value); } },
          ['Changed my mind', 'Ordered by mistake', 'Delivery is taking too long', 'Other'].map(function (r) { return h('option', { key: r, value: r }, r); })),
        h('div', { className: 'fbs-act' }, h(Button, { variant: 'primary', size: 'sm', onClick: function () { setConfirming(false); } }, 'Keep my order'), h(Button, { variant: 'outline', size: 'sm', className: 'fbs-danger', onClick: doCancel }, 'Yes, cancel order'))) : null,
      !canCancel && !cancelled && !delivered ? h('p', { className: 'small fbs-muted' }, 'You can cancel until your order is packed. After that, please contact support.') : null);
    var afterCard = delivered && !cancelled ? h(Card, { title: 'How was your order?' },
      h('div', { className: 'fbs-act fbs-reorder' }, h(Button, { variant: 'gold', size: 'sm', onClick: function () { if (p.onReorder) p.onReorder(order); } }, 'Order again')),
      h(FeedbackForm, { orderId: order.id, onSubmit: p.onFeedback })) : null;

    return h('section', { className: 'fb-root fbs-track', 'aria-label': 'Order tracking' },
      h('header', { className: 'fbs-track-head' },
        h('div', null,
          h('p', { className: 'label fbs-eyebrow' }, 'Order #' + (order.id || '')),
          h('h2', { className: 'heading-2 fbs-h2', 'aria-live': 'polite' }, headline)),
        h('span', { className: cx('fbs-live label', live && !delivered && !cancelled && 'is-live') }, h('span', { className: 'fbs-pulse', 'aria-hidden': true }), delivered ? 'Complete' : cancelled ? 'Closed' : live ? 'Live' : 'Paused')),
      h('div', { className: 'fbs-track-grid' },
        h(Card, { title: 'Status', className: 'fbs-tl-card' },
          cancelled ? h(Callout, { tone: 'warning', title: 'Cancelled.' }, order.cancelReason || 'This order was cancelled. Any payment is refunded to the original method.') : null,
          h('ol', { className: 'fbs-tl' }, STATUSES.map(function (s, i) {
            var state = cancelled ? (i <= idx ? 'done' : 'idle') : i < idx || delivered ? 'done' : i === idx ? 'now' : 'idle';
            var when = (order.timestamps || {})[s[0]];
            return h('li', { key: s[0], className: 'fbs-tl-item', 'data-state': state, 'aria-current': state === 'now' ? 'step' : undefined },
              h('span', { className: 'fbs-tl-dot' }, state === 'done' ? h(CheckIcon) : null),
              h('div', null,
                h('div', { className: 'fbs-tl-name nav-link' }, s[1], h('span', { className: 'fbs-sr' }, state === 'done' ? ', done' : state === 'now' ? ', in progress' : ', upcoming')),
                h('div', { className: 'small fbs-muted' }, when ? when + ' · ' + s[2] : (s[0] === 'DELIVERED' && order.etaClock ? 'ETA ' + order.etaClock : s[2]))));
          }))),
        h('div', { className: 'fbs-side' },
          h(Card, { title: 'Delivery route', className: 'fbs-map-card' },
            h('div', { className: 'fbs-map' },
              h('svg', { viewBox: '0 0 400 210', role: 'img', 'aria-label': 'Route from our kitchen to your address, ' + Math.round(progress * 100) + ' percent complete' },
                h('path', { className: 'fbs-road', d: 'M0 60H400M0 150H400M90 0V210M250 0V210M330 0V210' }),
                h('path', { ref: pathRef, className: 'fbs-route', d: 'M48 156C110 156 120 70 190 70S290 150 352 58', fill: 'none' }),
                h('g', { className: 'fbs-pin fbs-pin-a', transform: 'translate(48 156)' }, h('circle', { r: 9 }), h('text', { y: 28 }, 'Kitchen')),
                h('g', { className: 'fbs-pin fbs-pin-b', transform: 'translate(352 58)' }, h('circle', { r: 9 }), h('text', { y: 28 }, 'You')),
                h('g', { className: 'fbs-rider', style: { transform: 'translate(' + pt.x + 'px,' + pt.y + 'px)' } }, h('circle', { r: 13 }), h('circle', { r: 5 })))),
            h('p', { className: 'small fbs-muted fbs-map-note' }, 'Route and ETA update with each status change. Live driver GPS arrives in a later phase.')),
          actions,
          order.items ? h(Card, { title: 'In this order' },
            h('ul', { className: 'fbs-items' }, order.items.map(function (i, k) { return h('li', { key: k }, h('span', null, i.qty + ' × ' + i.name), h('span', { className: 'code' }, rupee(i.price * i.qty))); })),
            order.address ? h('p', { className: 'small fbs-muted fbs-addr' }, order.address) : null) : null,
          afterCard)));
  }

  /* ------------------------------------------------------------ ProductDetail */
  function BoxViewer(p) {
    var s = useState({ x: -18, y: 28 }), rot = s[0], setRot = s[1];
    var sd = useState(false), drag = sd[0], setDrag = sd[1];
    var last = useRef(null);
    var rmB = useReduced();
    useEffect(function () {
      if (rmB || drag) return undefined;
      var t = setInterval(function () { setRot(function (r) { return { x: r.x, y: r.y + 0.6 }; }); }, 40);
      return function () { clearInterval(t); };
    }, [drag, rmB]);
    function down(e) { last.current = { x: e.clientX, y: e.clientY }; setDrag(true); if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId); }
    function move(e) {
      if (!drag || !last.current) return;
      var dx = e.clientX - last.current.x, dy = e.clientY - last.current.y; last.current = { x: e.clientX, y: e.clientY };
      setRot(function (r) { return { x: Math.max(-60, Math.min(60, r.x - dy * 0.5)), y: r.y + dx * 0.6 }; });
    }
    function up() { setDrag(false); last.current = null; }
    function key(e) {
      var d = { ArrowLeft: [0, -12], ArrowRight: [0, 12], ArrowUp: [-8, 0], ArrowDown: [8, 0] }[e.key];
      if (d) { e.preventDefault(); setRot(function (r) { return { x: Math.max(-60, Math.min(60, r.x + d[0])), y: r.y + d[1] }; }); }
    }
    var faces = ['front', 'back', 'right', 'left', 'top', 'bottom'];
    var imgs = p.images || [];
    return h('div', { className: 'fbs-3d', tabIndex: 0, role: 'group', 'aria-label': p.name + ' 3D box view. Drag or use arrow keys to rotate.', onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up, onKeyDown: key },
      h('div', { className: 'fbs-3d-scene' },
        h('div', { className: 'fbs-cube', style: { transform: 'rotateX(' + rot.x + 'deg) rotateY(' + rot.y + 'deg)' } },
          faces.map(function (f, i) {
            return h('div', { key: f, className: 'fbs-face fbs-face-' + f },
              imgs[i % Math.max(imgs.length, 1)] && imgs.length ? h('img', { src: imgs[i % imgs.length], alt: '' }) : h('span', { className: 'code' }, f === 'front' ? p.name : f.toUpperCase()));
          }))),
      h('p', { className: 'fbs-3d-hint small' }, 'Drag to rotate'));
  }

  function ProductDetail(p) {
    var pr = p.product || {};
    var imgs = (pr.images || []).slice(0, 4);
    var slots = Math.min(4, Math.max(2, imgs.length || pr.slots || 3));
    var sizes = pr.sizes || [{ id: 'regular', label: 'Regular', extra: 0 }, { id: 'large', label: 'Large', extra: 50 }];
    var sm = useState('photos'), mode = sm[0], setMode = sm[1];
    var si = useState(0), idx = si[0], setIdx = si[1];
    var ss = useState(sizes[0].id), size = ss[0], setSize = ss[1];
    var sq = useState(1), qty = sq[0], setQty = sq[1];
    var sw = useState(!!p.wishlisted), wished = sw[0], setWished = sw[1];
    var sa = useState(false), added = sa[0], setAdded = sa[1];
    useEffect(function () { if (typeof p.wishlisted === 'boolean') setWished(p.wishlisted); }, [p.wishlisted]);
    useEffect(function () { if (!added) return undefined; var t = setTimeout(function () { setAdded(false); }, 1800); return function () { clearTimeout(t); }; }, [added]);
    var cur = sizes.filter(function (x) { return x.id === size; })[0] || sizes[0];
    var unit = (pr.price || 0) + (cur.extra || 0);
    var inStock = pr.stock === undefined || pr.stock > 0;
    var max = pr.stock === undefined ? 20 : Math.max(1, pr.stock);
    var low = inStock && pr.stock !== undefined && pr.stock <= 5;
    var thumbs = [];
    for (var i = 0; i < slots; i++) (function (n) {
      thumbs.push(h('button', { key: n, type: 'button', className: 'fbs-thumb', 'aria-label': 'Show image ' + (n + 1), 'aria-current': idx === n && mode === 'photos', onClick: function () { setMode('photos'); setIdx(n); } },
        h(Media, { src: imgs[n], alt: '', label: String(n + 1), ratio: '1 / 1' })));
    })(i);
    function add() { if (!inStock) return; setAdded(true); if (p.onAdd) p.onAdd(pr, qty, cur); }
    function wish() { var n = !wished; setWished(n); if (p.onWishlist) p.onWishlist(pr.id, n); }
    return h('section', { className: 'fb-root fbs-pd', 'aria-label': pr.name },
      h('div', { className: 'fbs-pd-grid' },
        h('div', { className: 'fbs-pd-gallery' },
          h('div', { className: 'fbs-pd-stage' },
            mode === 'photos' ? h(Media, { src: imgs[idx], alt: pr.name + ' image ' + (idx + 1), label: 'IMAGE ' + (idx + 1) + ' OF ' + slots, ratio: '1 / 1', className: 'fbs-pd-main' })
              : (p.renderModel ? p.renderModel(pr) : h(BoxViewer, { name: pr.name, images: imgs })),
            pr.badge ? h('span', { className: 'fbs-pc-badge label' }, pr.badge) : null,
            !inStock ? h('span', { className: 'fbs-pc-out heading-3' }, 'Out of stock') : null),
          h('div', { className: 'fbs-thumbs' }, thumbs,
            h('button', { type: 'button', className: 'fbs-thumb fbs-thumb-3d nav-link', 'aria-pressed': mode === '3d', onClick: function () { setMode(mode === '3d' ? 'photos' : '3d'); } }, '3D'))),
        h('div', { className: 'fbs-pd-info' },
          pr.category ? h('p', { className: 'label fbs-eyebrow' }, pr.category) : null,
          h('h1', { className: 'heading-2 fbs-h2 fbs-pd-title' }, pr.name),
          h('div', { className: 'fbs-pd-price kpi', 'aria-live': 'polite' }, rupee(unit * qty), qty > 1 ? h('span', { className: 'small fbs-muted fbs-pd-each' }, ' ' + rupee(unit) + ' each') : null),
          h('p', { className: 'body fbs-pd-desc' }, pr.longDescription || pr.description),
          pr.ingredients ? h('div', { className: 'fbs-pd-tags', 'aria-label': 'Ingredients' }, pr.ingredients.map(function (t) { return h(Tag, { key: t }, t); })) : null,
          h('fieldset', { className: 'fbs-fs' }, h('legend', { className: 'label fbs-eyebrow' }, 'Size'),
            h('div', { className: 'fbs-sizes', role: 'radiogroup' }, sizes.map(function (x) {
              return h('button', { key: x.id, type: 'button', role: 'radio', 'aria-checked': size === x.id, className: 'fbs-size nav-link', onClick: function () { setSize(x.id); } }, x.label, x.extra ? h('span', { className: 'small' }, ' +' + rupee(x.extra)) : null);
            }))),
          low ? h('p', { className: 'fbs-pc-low small', 'aria-live': 'polite' }, 'Only ' + pr.stock + ' left') : null,
          h('div', { className: 'fbs-pd-buy' },
            h('div', { className: 'fbs-step', role: 'group', 'aria-label': 'Quantity' },
              h('button', { type: 'button', 'aria-label': 'Decrease quantity', disabled: qty <= 1, onClick: function () { setQty(qty - 1); } }, '−'),
              h('output', { 'aria-live': 'polite' }, qty),
              h('button', { type: 'button', 'aria-label': 'Increase quantity', disabled: qty >= max || !inStock, onClick: function () { setQty(qty + 1); } }, '+')),
            h(Button, { variant: 'gold', disabled: !inStock, onClick: add, className: 'fbs-pd-add' }, !inStock ? 'Unavailable' : added ? 'Added to cart' : 'Add to Cart'),
            h('button', { type: 'button', className: 'fbs-pd-wish', 'aria-pressed': wished, onClick: wish }, h(HeartIcon, { filled: wished }), h('span', { className: 'nav-link' }, wished ? 'In wishlist' : 'Add to Wishlist')),
            h(ShareButton, { title: pr.name, text: 'Fresh fruit from FreshBliss: ' + pr.name, url: p.shareUrl })),
          !inStock ? h(NotifyMe, { product: pr, onNotify: p.onNotify }) : null,
          h(Callout, { className: 'fbs-pd-note', title: 'Delivery.' }, (pr.deliveryTime || 'Within 1 hour in Bangalore') + '. Prepared fresh after you order.'))));
  }

  /* ============================================================ accessibility settings (non-functional) */
  var A11Y = { motion: 'system', listeners: [] };
  var mqR = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var mqC = window.matchMedia ? window.matchMedia('(prefers-contrast: more)') : null;
  function isReduced() { return A11Y.motion === 'reduce' || !!(mqR && mqR.matches); }
  function useReduced() {
    var s = useState(isReduced()), v = s[0], set = s[1];
    useEffect(function () {
      function f() { set(isReduced()); }
      A11Y.listeners.push(f);
      if (mqR && mqR.addEventListener) mqR.addEventListener('change', f);
      f();
      return function () {
        A11Y.listeners = A11Y.listeners.filter(function (x) { return x !== f; });
        if (mqR && mqR.removeEventListener) mqR.removeEventListener('change', f);
      };
    }, []);
    return v;
  }
  function setMotion(m) { A11Y.motion = m; A11Y.listeners.slice().forEach(function (f) { f(); }); }

  var A11Y_DEFAULT = { theme: 'auto', motion: 'system', text: 'default' };
  var A11yCtx = R.createContext(null);
  function loadPrefs(key) {
    try { var raw = window.localStorage.getItem(key); if (raw) return Object.assign({}, A11Y_DEFAULT, JSON.parse(raw)); } catch (e) { /* storage blocked */ }
    return Object.assign({}, A11Y_DEFAULT);
  }

  function SkipLink(p) {
    return h('a', { className: 'fba-skip', href: '#' + (p.target || 'fbs-main') }, p.children || 'Skip to main content');
  }

  function A11yProvider(p) {
    var key = p.storageKey || 'freshbliss-a11y';
    var s = useState(function () { return loadPrefs(key); }), prefs = s[0], setPrefs = s[1];
    var sc = useState(!!(mqC && mqC.matches)), sysContrast = sc[0], setSysContrast = sc[1];
    useEffect(function () {
      if (!mqC || !mqC.addEventListener) return undefined;
      function f() { setSysContrast(mqC.matches); }
      mqC.addEventListener('change', f);
      return function () { mqC.removeEventListener('change', f); };
    }, []);
    useEffect(function () { setMotion(prefs.motion); }, [prefs.motion]);
    useEffect(function () { try { window.localStorage.setItem(key, JSON.stringify(prefs)); } catch (e) { /* ignore */ } }, [prefs, key]);
    var theme = prefs.theme === 'auto' ? (sysContrast ? 'contrast' : undefined) : prefs.theme;
    var value = {
      prefs: prefs, theme: theme,
      set: function (k, v) { setPrefs(function (o) { var n = Object.assign({}, o); n[k] = v; return n; }); },
      reset: function () { setPrefs(Object.assign({}, A11Y_DEFAULT)); }
    };
    return h(A11yCtx.Provider, { value: value },
      h('div', { className: cx('fb-a11y', p.className), 'data-theme': theme, 'data-text': prefs.text, 'data-motion': prefs.motion === 'reduce' ? 'reduce' : 'system' },
        p.skipTo ? h(SkipLink, { target: p.skipTo }) : null, p.children));
  }

  function useA11y() { return R.useContext(A11yCtx); }

  var A11Y_GROUPS = [
    ['theme', 'Colour theme', [['auto', 'Match my device'], ['light', 'Cream'], ['dark', 'Forest'], ['contrast', 'High contrast']]],
    ['motion', 'Motion', [['system', 'Follow my device'], ['reduce', 'Reduce motion']]],
    ['text', 'Text size', [['default', 'Default'], ['large', 'Large'], ['larger', 'Larger']]]
  ];
  function A11yPanel(p) {
    var ctx = useA11y();
    var so = useState(!!p.defaultOpen), open = so[0], setOpen = so[1];
    var btn = useRef(null);
    if (!ctx) return h(Callout, { tone: 'warning', title: 'Missing provider.' }, 'Wrap the app in A11yProvider so these settings can apply.');
    var pf = ctx.prefs;
    function onKey(e) { if (e.key === 'Escape') { setOpen(false); if (btn.current) btn.current.focus(); } }
    var changed = pf.theme !== 'auto' || pf.motion !== 'system' || pf.text !== 'default';
    var summary = [];
    A11Y_GROUPS.forEach(function (g) { g[2].forEach(function (o) { if (o[0] === pf[g[0]] && (pf[g[0]] !== A11Y_DEFAULT[g[0]])) summary.push(o[1]); }); });
    return h('div', { className: 'fba-wrap', onKeyDown: onKey },
      h('button', { ref: btn, type: 'button', className: 'fba-toggle nav-link', 'aria-expanded': open, 'aria-controls': 'fba-panel', onClick: function () { setOpen(!open); } },
        h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', 'aria-hidden': true },
          h('circle', { cx: 12, cy: 4.5, r: 2, fill: 'currentColor' }),
          h('path', { d: 'M5 8.5h14M12 8.5V14m0 0l-3.5 6M12 14l3.5 6', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' })),
        'Accessibility'),
      open ? h('div', { id: 'fba-panel', className: 'fba-panel', role: 'group', 'aria-label': 'Accessibility settings' },
        h('h3', { className: 'heading-3 fba-title' }, 'Make FreshBliss easier to use'),
        A11Y_GROUPS.map(function (g) {
          return h('fieldset', { key: g[0], className: 'fba-fs' }, h('legend', { className: 'label fba-legend' }, g[1]),
            h('div', { className: 'fba-opts' }, g[2].map(function (o) {
              return h('label', { key: o[0], className: 'fba-opt' },
                h('input', { type: 'radio', name: 'fba-' + g[0], value: o[0], checked: pf[g[0]] === o[0], onChange: function () { ctx.set(g[0], o[0]); } }),
                h('span', { className: 'nav-link' }, o[1]));
            })));
        }),
        h('div', { className: 'fba-foot' },
          h('button', { type: 'button', className: 'fba-reset small', disabled: !changed, onClick: ctx.reset }, 'Reset to defaults'),
          h('p', { className: 'small fbs-muted', role: 'status' }, changed ? 'Applied: ' + summary.join(', ') + '. Saved on this device.' : 'Using your device settings.'))) : null);
  }

  window.FreshBliss = { Button: Button, Tag: Tag, Badge: Badge, Card: Card, Stat: Stat, Callout: Callout, CodeBlock: CodeBlock, DataTable: DataTable, ArchitectureExplorer: ArchitectureExplorer, ProductCard: ProductCard, HomeScreen: HomeScreen, Cart: Cart, OrderTracking: OrderTracking, ProductDetail: ProductDetail, A11yProvider: A11yProvider, A11yPanel: A11yPanel, SkipLink: SkipLink, useA11y: useA11y, FeedbackForm: FeedbackForm, DeliveryChecker: DeliveryChecker, SupportButton: SupportButton, ShareButton: ShareButton };
})();
