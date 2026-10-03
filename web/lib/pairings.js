// "Chef's Notes & Pairings": a simple serving idea for a box, chosen by the box's page address (its slug), or
// failing that its category (so a new box added later in the Immunity category still gets the citrus idea).
// Pure function (no React, no Firebase), so it is easy to test.
//
// These are fixed suggestions written by hand, not generated from the box's contents, and they are
// serving ideas only (no health claims). Check them against what is really in your boxes before launch.
//
//   getPairingSuggestion(slug, category) -> { title, blurb, time, ingredients: [3 strings], steps: [2 strings] }

const MANGO = {
  title: 'Mango Coconut Chia Pudding',
  blurb: 'Cool, creamy and naturally sweet: a dessert that is really breakfast.',
  time: '5 minutes, plus an overnight set',
  ingredients: ['3 tbsp chia seeds', '1 cup coconut milk', '1 ripe mango from your box, diced'],
  steps: ['Stir the chia seeds into the coconut milk and chill for at least 4 hours, or overnight.', 'Spoon into a glass, top with the diced mango and serve cold.'],
};

const CITRUS = {
  title: 'Morning Ginger Citrus Detox Shot',
  blurb: 'A small, sharp, bright start to the day.',
  time: '5 minutes',
  ingredients: ['2 oranges from your box, juiced', '1 inch of fresh ginger, grated', 'Juice of half a lemon'],
  steps: ['Squeeze the oranges and lemon, then stir in the grated ginger.', 'Strain into two small glasses and drink it fresh and cold.'],
};

const BERRY = {
  title: 'Antioxidant Acai Bowl',
  blurb: 'A thick, jewel-coloured bowl you can eat with a spoon.',
  time: '10 minutes',
  ingredients: ['1 frozen acai pack', '1 frozen banana', 'A handful of berries from your box'],
  steps: ['Blend the acai pack and banana with a splash of water until thick and smooth.', 'Pour into a bowl and pile the fresh berries on top.'],
};

const DEFAULT = {
  title: 'Fresh Artisanal Fruit Salad',
  blurb: 'Let the fruit do the talking.',
  time: '5 minutes',
  ingredients: ['Your whole box, cut into bite-sized pieces', 'Juice of half a lime', 'A few fresh mint leaves'],
  steps: ['Toss the fruit gently with the lime juice in a large bowl.', 'Tear the mint over the top and serve straight away, or chilled.'],
};

const RULES = [
  [MANGO, ['mango']],
  [CITRUS, ['citrus', 'immunity']],
  [BERRY, ['berry', 'berries']],
];

const pick = (text) => RULES.find(([, words]) => words.some((w) => text.includes(w)))?.[0] ?? null;

export function getPairingSuggestion(slug, category) {
  return pick(String(slug ?? '').toLowerCase()) ?? pick(String(category ?? '').toLowerCase()) ?? DEFAULT;
}
