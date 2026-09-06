const db = require('../database/db');
const { notifyUser } = require('./notifier');
const { sendPushToUser } = require('./push');

// A subscriber's chosen from/to overlaps one of the creator's actual
// availability slots for that day — same "from < slotTo && slotFrom < to"
// overlap test MapView.jsx's matchesFilters uses client-side.
function timesOverlap(subFrom, subTo, slotFrom, slotTo) {
  return subFrom < slotTo && slotFrom < subTo;
}

// Settings > App preferences > Notifications > New Help Available. Called
// (fire-and-forget, never awaited) right after a new Help item is created
// (see routes/help.js POST /). Finds everyone of the "opposite" role from
// this item's creator, plus every admin, who has turned the subscription on
// and whose saved filter matches this specific item — then notifies each
// one via push (system banner + in-app popup/vibration, see
// utils/push.js and client/src/utils/pushNotifications.js) and whichever of
// Email/SMS/WhatsApp they've enabled for the 'new_help' event (see
// utils/notifier.js). Entirely best-effort — every failure here is caught
// and logged, never thrown back to the route that created the item.
//
// creatorRole/direction determine the audience the same way Help Universe/
// Remar Store already determine who an item is even shown to: a helper's
// item is an offer (relevant to beneficiaries), a beneficiary's is a
// request (relevant to helpers); a legacy admin-direct item falls back to
// its own direction field the same way. Admins always see everything, same
// as their existing full visibility everywhere else in the app.
async function notifyHelpSubscribers({ helpRowId, helpId, title, category, logisticsPreference, creatorRole, direction, creatorAvailability }) {
  try {
    const audienceRoles = creatorRole === 'helper' ? ['beneficiary', 'admin']
      : creatorRole === 'beneficiary' ? ['helper', 'admin']
      : direction === 'offer' ? ['beneficiary', 'admin']
      : direction === 'request' ? ['helper', 'admin']
      : ['admin'];

    const result = await db.query(
      `SELECT id, help_subscription FROM users WHERE role = ANY($1) AND (help_subscription->>'enabled')::boolean = true`,
      [audienceRoles]
    );
    if (!result.rows.length) return;

    // Flattened once per call, not per subscriber — every subscriber is
    // matched against this same creator's same availability.
    const slotsByDay = {};
    for (const [day, slots] of Object.entries(creatorAvailability || {})) {
      slotsByDay[day] = (Array.isArray(slots) ? slots : []).filter((s) => s?.from && s?.to);
    }

    for (const row of result.rows) {
      const sub = row.help_subscription || {};
      if (Array.isArray(sub.categories) && sub.categories.length && !sub.categories.includes(category)) continue;
      if (sub.day) {
        const daySlots = slotsByDay[sub.day] || [];
        if (!daySlots.length) continue;
        if (sub.from && sub.to) {
          const overlaps = daySlots.some((s) => timesOverlap(sub.from, sub.to, s.from, s.to));
          if (!overlaps) continue;
        }
      }
      if (Array.isArray(sub.logistics) && sub.logistics.length) {
        const anyMatch = Array.isArray(logisticsPreference) && logisticsPreference.some((v) => sub.logistics.includes(v));
        if (!anyMatch) continue;
      }

      notifyUser(row.id, 'new_help', {
        subject: `REMAR Schweiz: New Help matching your filters — ${helpId}`,
        text: `A new Help item matching your saved filters was just posted: ${title} (${helpId}).`,
      });
      sendPushToUser(row.id, {
        title: 'New Help available',
        body: `${title} (${helpId}) matches your saved filters.`,
        data: { type: 'new_help', help_row_id: helpRowId, help_id: helpId },
      });
    }
  } catch (err) {
    console.error('notifyHelpSubscribers error:', err.message);
  }
}

module.exports = { notifyHelpSubscribers };
