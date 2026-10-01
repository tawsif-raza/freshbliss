ProductDetail is the single product page: an image gallery with 2 to 4 slots plus a 3D box view, size choice, quantity, a live total, a gold Add to Cart button, a wishlist toggle and a delivery note.

Provide `product` (`id`, `name`, `description`, `price`, and optionally `images`, `badge`, `category`, `ingredients`, `sizes`, `stock`, `deliveryTime`). Sizes default to Regular and Large (+₹50). Quantity is capped at `stock`; at 0 the page shows Out of stock and disables the button, at 5 or fewer it says "Only N left". Wire `onAdd(product, qty, size)` and `onWishlist(id, next)`. The 3D tab is a lightweight CSS box you can drag or steer with arrow keys, with photos as the fallback; pass `renderModel(product)` to swap in a lazy-loaded Three.js scene. Stock and price shown here are previews, the server re-checks both.

The page also has a Share button (`shareUrl`) and, when a product is out of stock, a Notify me when back action (`onNotify(product)`) in place of the disabled purchase.
