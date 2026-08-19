// Category → Sub-category → Item taxonomy for the New Help form, sourced
// from Help.xlsx (the "Services" sheet). Categories without a sub-category
// column in the spreadsheet (Professional services, Money) are given a
// single "General" sub-category so the form's three-dropdown flow still
// works for them. Toiletries' sub-category is set to "Toiletries" itself
// (also updated in Help.xlsx column B) rather than a generic "General", so
// its one dropdown option reads naturally.
export const HELP_TAXONOMY = {
  'Food': {
    'Vegetable': ['Brocolli', 'Carot', 'Potatoe', 'Pepper', 'Onion', 'Eggplant', 'Lettuce', 'Mushrooms', 'Garlic', 'Cauliflower', 'Spinach', 'Cabbage', 'Garden rocket', 'Butterhead Lettuce'],
    'Fruit': ['Tomato', 'Apple', 'Orange', 'Banana', 'Avocado', 'Grapes', 'Cucumber', 'Lemon'],
    'Cereal': ['Rice', 'Wheat', 'Pasta', 'Oats'],
    'Sauce': ['Soya sauce', 'Tomato sauce', 'Chili sauce'],
    'Spices': ['Salt', 'Sugar'],
    'Fats': ['Oil', 'Butter', 'Ghee', 'Cheese'],
  },
  'Toiletries': {
    'Toiletries': ['Shampoo', 'Conditioner', 'Duschgel', 'Toiletpaper', 'Mouthwash', 'Deodorant', 'Handwash', 'Toothpaste', 'Earbuds', 'Sanitary pads'],
  },
  'Clothes': {
    'Clothes': ['Shirt', 'Polo', 'Jacket', 'Dress', 'Sweater', 'Innerwear'],
    'Accessories': ['Belt', 'Shoes', 'Cap', 'Socks'],
  },
  'Social services': {
    'Conversation': ['Mind coaching (Audio)', 'Mind coaching (Video)', 'Mind coaching (In-person)'],
    'Home support': ['Cleaning', 'Furniture assembly/ repair', 'Cooking', 'Plumbing', 'Home delivery'],
    'Activity companion': ['Hiking', 'Yoga', 'Swimming', 'Jogging', 'Velo cycling', 'Walking'],
  },
  'Professional services': {
    'General': ['Tax', 'Legal', 'Technology', 'Mental health'],
  },
  'Money': {
    'General': ['Cash', 'SEPA transfer', 'Paypal'],
  },
};

// Fixed order for the Category dropdown (matches the spreadsheet's row order).
export const HELP_CATEGORIES_ORDER = Object.keys(HELP_TAXONOMY);

// Units available for the Quantity field.
export const HELP_UNITS = ['piece(s)', 'kg', 'g', 'l', 'ml', 'metre', 'cm', 'CHF', 'EUR', 'hour(s)', 'min'];

// Item → delivery mode ('Online' or 'Physical'), sourced from Help.xlsx's
// Delivery column. Everything defaults to 'Physical' — only the items below
// are 'Online'. Note: Help.xlsx has separate "X" / "X (online)" rows for
// each Professional services item (Tax/Tax (online), Legal/Legal (online),
// etc.), but HELP_TAXONOMY above collapses each pair into one item (see its
// own comment) — since the online/physical choice isn't separately
// selectable there, those items default to 'Physical' (the in-person/base
// row). Revisit if Professional services should offer both modes as
// distinct items.
const ONLINE_ITEMS = new Set([
  'Social services > Conversation > Mind coaching (Audio)',
  'Social services > Conversation > Mind coaching (Video)',
  'Money > General > SEPA transfer',
  'Money > General > Paypal',
]);

export function getItemDelivery(category, subCategory, item) {
  if (!category || !subCategory || !item) return 'Physical';
  return ONLINE_ITEMS.has(`${category} > ${subCategory} > ${item}`) ? 'Online' : 'Physical';
}
