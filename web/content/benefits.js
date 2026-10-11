// The words of the "Why fruit every day" section on the home page (components/HealthBenefits.js), just under the FAQ.
//
// Health wording on food is regulated (FSSAI Advertising and Claims Regulations, 2018; the consumer authority's rules
// on misleading advertisements), so every line here is a general, well-established nutrition fact, worded as "a good
// source of" or "can help", never as a cure, a weight-loss promise or a visible result. There is deliberately no
// before-and-after photo: nobody has been photographed eating our products every day, and a stock or made-up one would
// be a fake testimonial. web/tests/benefits.test.mjs refuses cure, weight-loss, result and guarantee wording.
//
// The per-product list under the cards is not written here: it comes from each product's own `keyBenefits` (the same
// phrases its product page shows), so the two can never disagree.

export const BENEFITS = {
  eyebrow: 'Good for you',
  title: 'Why fruit every day',
  intro:
    'India’s National Institute of Nutrition recommends fruit every day as part of a balanced diet. Here is what the fruit and drinks in our shop bring to the table.',
  imageAlt: 'A bowl of fresh kiwi, watermelon, strawberries and berries',
  habitTitle: 'What a daily fruit habit can help with',
  productsTitle: 'What’s in each one',
  productsIntro: 'The same notes you see on each product’s page.',
  noteTitle: 'Worth knowing',
  note: [
    'Shakes, lassi, sharbat and fruit juice contain sugar, natural or added, and less fibre than whole fruit. Enjoy them as a treat rather than in place of whole fruit.',
    'This is general information, not medical advice. If you have diabetes or kidney disease, are pregnant, or follow a special diet, ask your doctor which of these suit you.',
  ],
  source: { label: 'ICMR–National Institute of Nutrition, Dietary Guidelines for Indians', href: 'https://www.nin.res.in/' },
};

// The cards: one nutrient or effect each, with the fruit in our shop that carry it. Each `id` picks the icon drawn for it
// in components/HealthBenefits.js.
export const BENEFIT_POINTS = [
  {
    id: 'fibre',
    title: 'Fibre for digestion',
    text: 'Guava, apples, pomegranate and oranges give you dietary fibre, which supports regular digestion and helps you feel full for longer.',
  },
  {
    id: 'vitaminC',
    title: 'Vitamin C',
    text: 'Guava, oranges, papaya and kiwi are good sources of vitamin C, which your body needs for normal immune function and to make the collagen in healthy skin.',
  },
  {
    id: 'hydration',
    title: 'Hydration',
    text: 'Watermelon and muskmelon are about 90% water, and tender coconut water, nimbu pani and plain water help you top up fluids after a long fast or on a hot day.',
  },
  {
    id: 'potassium',
    title: 'Potassium',
    text: 'Bananas, dates and tender coconut water contain potassium, a mineral your muscles and nerves use to work normally.',
  },
  {
    id: 'energy',
    title: 'Natural energy',
    text: 'Dates carry natural sugars along with fibre and potassium, which is why they are the traditional first bite when breaking a fast.',
  },
  {
    id: 'colour',
    title: 'Eat the colours',
    text: 'Mango and papaya carry vitamin A, and grapes, berries and pomegranate carry their own plant compounds. A mix of colours gives you a wider mix of nutrients.',
  },
  {
    id: 'calcium',
    title: 'Calcium and protein',
    text: 'Milk, lassi and chaas give you calcium and protein. Lassi and chaas are made from curd.',
  },
];

// The habit list: modest, general effects of eating fruit regularly, nothing anyone could see in a photo.
export const HABIT_POINTS = [
  'More regular digestion, from the extra fibre',
  'Feeling full between meals, so fruit can replace a packaged snack',
  'Staying hydrated on hot days and after fasting',
  'Getting more of the vitamins and minerals your body needs every day',
];
