const Category    = require('../models/Category');
const ProductType = require('../models/ProductType');
const Unit        = require('../models/Unit');

const SEED_CATEGORIES = [
  { name: 'Grocery',        description: 'Food and beverage products' },
  { name: 'Household',      description: 'Cleaning and home products' },
  { name: 'Tobacco',        description: 'Cigarettes and tobacco products' },
  { name: 'Personal Care',  description: 'Soaps, shampoos, hygiene products' },
  { name: 'Daily Essentials', description: 'Everyday must-have products' },
];

const SEED_PRODUCT_TYPES = [
  // Grocery
  { name: 'Rice & Chawal' }, { name: 'Dal & Pulses' },
  { name: 'Sugar & Chini' }, { name: 'Atta & Flour' },
  { name: 'Oil & Refined' }, { name: 'Masala' },
  { name: 'Whole Spices' }, { name: 'Biscuit & Cookies' },
  { name: 'Snacks & Namkeen' }, { name: 'Haldiram Products' },
  // Household
  { name: 'Surf & Detergent', cat: 'Household' }, { name: 'Cleaning Products', cat: 'Household' },
  // Tobacco
  { name: 'Cigarette', cat: 'Tobacco' }, { name: 'Gutkha & Pan Masala', cat: 'Tobacco' },
  // Personal Care
  { name: 'Soap & Sabun', cat: 'Personal Care' }, { name: 'Shampoo & Hair Care', cat: 'Personal Care' },
  // Daily Essentials
  { name: 'Dairy Products', cat: 'Daily Essentials' },
  { name: 'Milk & Dudh', cat: 'Daily Essentials' },
  { name: 'Curd & Dahi', cat: 'Daily Essentials' },
];

const SEED_UNITS = [
  { name: 'Piece',   unitGroup: 'countable', description: 'Single item' },
  { name: 'Packet',  unitGroup: 'countable', description: 'Sealed packet' },
  { name: 'Box',     unitGroup: 'countable', description: 'Boxed item' },
  { name: 'Bottle',  unitGroup: 'countable', description: 'Bottled product' },
  { name: 'Carton',  unitGroup: 'countable', description: 'Carton/case' },
  { name: 'Kg',      unitGroup: 'weight',    description: 'Kilogram' },
  { name: 'Gram',    unitGroup: 'weight',    description: 'Gram' },
  { name: 'Liter',   unitGroup: 'weight',    description: 'Liter (liquid)' },
  { name: 'ml',      unitGroup: 'weight',    description: 'Milliliter (liquid)' },
];

const seedCatalog = async () => {
  try {
    // Categories
    const existCats = await Category.countDocuments();
    if (existCats > 0) { console.log('ℹ️  Catalog already seeded'); return; }

    const cats = await Category.insertMany(SEED_CATEGORIES);
    console.log(`🌱 Seeded ${cats.length} categories`);

    // Map name → _id
    const catMap = {};
    cats.forEach(c => { catMap[c.name] = c._id; });

    // Product Types
    const ptDocs = SEED_PRODUCT_TYPES.map(pt => ({
      name: pt.name,
      category: catMap[pt.cat || 'Grocery']
    }));
    const pts = await ProductType.insertMany(ptDocs);
    console.log(`🌱 Seeded ${pts.length} product types`);

    // Units
    const units = await Unit.insertMany(SEED_UNITS);
    console.log(`🌱 Seeded ${units.length} units`);

    console.log('✅ Catalog seed complete');
  } catch (err) {
    console.error('Catalog seed error:', err.message);
  }
};

module.exports = { seedCatalog };
