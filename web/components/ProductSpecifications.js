// "Product Specifications": four accordion rows on the product page, each with an icon:
//   Ingredients & Allergens  |  Nutritional Information  |  Sourcing & Brand  |  Shelf Life & Storage
// Each row opens and closes on its own with a smooth slide (components/AccordionItem.js, row style: a fine
// bottom border and deep-green headings).
//
//   product  a normalised product (lib/product.js)
//
// A row appears only if the product has something for it (lib/specs.js: specRows), and the whole section is left
// out when no row would show, so a product with none of these fields looks exactly as it did before and nothing
// can break. The words come from the product document in Firestore; nothing here is made up.

import { Hourglass, Milk, Tractor, ChartColumn } from 'lucide-react';
import AccordionItem from '@/components/AccordionItem';
import { hasSpecs, specRows } from '@/lib/specs';

function Ingredients({ product }) {
  const { ingredientsText, ingredients, allergens } = product;
  return (
    <div className="flex flex-col gap-3">
      {ingredientsText ? (
        <p>{ingredientsText}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {ingredients.map((item) => (
            <li key={item} className="rounded-pill border border-line bg-surface-tag px-3 py-1 text-small text-brand-text">
              {item}
            </li>
          ))}
        </ul>
      )}
      {allergens && (
        <p>
          <span className="font-bold text-ink">Allergens: </span>
          {allergens}
        </p>
      )}
    </div>
  );
}

function Nutrition({ nutrition }) {
  return (
    <div>
      {nutrition.per && <p className="text-label text-gold">{nutrition.per}</p>}
      <dl className="mt-2 max-w-md divide-y divide-line rounded-lg border border-line bg-surface-card">
        {nutrition.rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-4 px-4 py-2 text-body">
            <dt className="text-ink-muted">{row.label}</dt>
            <dd className="font-bold text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-small text-ink-muted">Typical values. They can vary a little with the season and the batch.</p>
    </div>
  );
}

function ShelfLife({ product }) {
  return (
    <dl className="flex flex-col gap-3">
      {product.shelfLife && (
        <div>
          <dt className="text-label text-gold">Shelf life</dt>
          <dd className="mt-0.5 text-ink">{product.shelfLife}</dd>
        </div>
      )}
      {product.storage && (
        <div>
          <dt className="text-label text-gold">Storage</dt>
          <dd className="mt-0.5 text-ink">{product.storage}</dd>
        </div>
      )}
    </dl>
  );
}

export default function ProductSpecifications({ product }) {
  if (!hasSpecs(product)) return null;
  const show = specRows(product);

  return (
    <section aria-labelledby="specs-title" className="mt-10 max-w-3xl">
      <h2 id="specs-title" className="text-heading-3 text-ink">
        Product Specifications
      </h2>
      <div className="mt-3 border-t border-line">
        {show.ingredients && (
          <AccordionItem variant="row" icon={Milk} question="Ingredients & Allergens">
            <Ingredients product={product} />
          </AccordionItem>
        )}
        {show.nutrition && (
          <AccordionItem variant="row" icon={ChartColumn} question="Nutritional Information">
            <Nutrition nutrition={product.nutrition} />
          </AccordionItem>
        )}
        {show.sourcing && (
          <AccordionItem variant="row" icon={Tractor} question="Sourcing & Brand">
            <p>{product.brandStory}</p>
          </AccordionItem>
        )}
        {show.shelfLife && (
          <AccordionItem variant="row" icon={Hourglass} question="Shelf Life & Storage">
            <ShelfLife product={product} />
          </AccordionItem>
        )}
      </div>
    </section>
  );
}
