// Item -> price/unit lookup, sourced from Help.xlsx's "Price/ unit" and
// "Unit" columns (Services sheet). Only items REMAR has actually priced show
// up here — most rows in the spreadsheet still have a blank price, and those
// items default to a 0 estimate until an admin fills in a real figure by
// hand on the Help ID's approval box (see computeDefaultValueAndHours below).
// Keyed the same way client/src/data/helpTaxonomy.js keys ONLINE_ITEMS —
// "Category > Sub-category > Item" — so a help row's own category/
// sub_category/title columns can be looked up directly.
const ITEM_PRICES = {
  'Food > Cereal > Wheat': { price: 4, unit: 'kg' },
  'Food > Cereal > Oats': { price: 1, unit: 'kg' },
  'Food > Fruit > Lemon': { price: 0.5, unit: 'piece(s)' },
};

function getItemPrice(category, subCategory, item) {
  if (!category || !subCategory || !item) return null;
  return ITEM_PRICES[`${category} > ${subCategory} > ${item}`] || null;
}

// Default Value + Hours shown (and editable) on a Help ID's admin approval
// box once admin has approved the match — see PUT /assignments/:id/respond
// and the two other admin_approved call sites in assignments.js.
//
//  - Value = Help.xlsx price/unit x the help item's own quantity. Assumes
//    the creator's chosen unit matches the price list's unit (an accepted
//    simplification — no cross-unit conversion); items REMAR hasn't priced
//    yet default to 0 until an admin enters a real figure.
//  - Hours: if the help item's own quantity is itself measured in hours,
//    twice that quantity (the help side + the admin/logistics side of
//    delivering it); otherwise 30 minutes if the match's agreed logistics
//    involve picking the item up from the helper's own location, 1 hour if
//    not (drop-off, or no logistics choice at all — e.g. services).
function computeDefaultValueAndHours(help, assignmentLogisticsPreference) {
  const quantity = Number(help.quantity) || 0;
  const priceInfo = getItemPrice(help.category, help.sub_category, help.title);
  const value = priceInfo ? Math.round(priceInfo.price * quantity * 100) / 100 : 0;

  let duration_hours;
  if (help.unit === 'hour(s)') {
    duration_hours = Math.round(quantity * 2 * 10) / 10;
  } else {
    const pickedUpFromHelper = Array.isArray(assignmentLogisticsPreference) && assignmentLogisticsPreference.includes('pickup');
    duration_hours = pickedUpFromHelper ? 0.5 : 1;
  }
  return { value, duration_hours };
}

module.exports = { getItemPrice, computeDefaultValueAndHours };
