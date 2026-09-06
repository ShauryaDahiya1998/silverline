const db = require('../database/db');
const { notifyUser } = require('./notifier');
const { sendPushToUser } = require('./push');

// A subscriber's chosen from/to overlaps one of the creator's actual
// availability slots for that day — same "from < slotTo && slotFrom < to"
// overlap test MapView.jsx's matchesFilters uses client-side.
function timesOverlap(subFrom, subTo, slotFrom, slotTo) {
  return subFrom < slotTo && slotFrom < subTo;
}

// Great-circle distance in km — same formula MapView.jsx's shaded
// preferred-area circle is drawn from client-side, just needed here
// server-side too for the "Only within my preferred location" filter.
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
async function notifyHelpSubscribers({ helpRowId, helpId, title, category, logisticsPreference, creatorRole, direction, creatorAvailability, creatorLat, creatorLon }) {
  try {
    const audienceRoles = creatorRole === 'helper' ? ['beneficiary', 'admin']
      : creatorRole === 'beneficiary' ? ['helper', 'admin']
      : direction === 'offer' ? ['beneficiary', 'admin']
      : direction === 'request' ? ['helper', 'admin']
      : ['admin'];

    // preferred_regions lives on the helpers/beneficiaries row, not on
    // users itself (see helpers/beneficiaries.preferred_regions — same
    // field Register/Edit Profile's Regions section and MapView.jsx's
    // resolveOwnPreferredAreas already read) — pulled in via LEFT JOIN
    // here so "Only within my preferred location" can be checked below
    // without a per-subscriber follow-up query. Admin has neither row, so
    // COALESCE just leaves it null for them (they never set ownAreaOnly
    // anyway — see NotificationPreferences.jsx).
    const result = await db.query(
      `SELECT u.id, u.help_subscription, COALESCE(h.preferred_regions, b.preferred_regions) AS preferred_regions
       FROM users u
       LEFT JOIN helpers h ON h.user_id = u.id
       LEFT JOIN beneficiaries b ON b.user_id = u.id
       WHERE u.role = ANY($1) AND (u.help_subscription->>'enabled')::boolean = true`,
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
      // "Only within my preferred location" — only enforceable when both
      // sides have real coordinates: this item's creator has a lat/lon on
      // file, and the subscriber's own preferred_regions is saved in
      // 'distance' mode (a center point + radius, set on Register/Edit
      // Profile). 'areas' mode (free-text place names) needs live
      // geocoding to resolve — not worth doing per-subscriber on every
      // new Help post — so, like a missing creator location, it's left
      // unfiltered (fails open) rather than silently dropping those
      // subscribers' notifications.
      if (sub.ownAreaOnly && creatorLat != null && creatorLon != null) {
        const region = row.preferred_regions;
        if (region?.mode === 'distance' && region.center?.lat != null && region.center?.lon != null) {
          const radiusKm = Number(region.distance_km) > 0 ? Number(region.distance_km) : 8;
          const distKm = haversineKm(creatorLat, creatorLon, Number(region.center.lat), Number(region.center.lon));
          if (distKm > radiusKm) continue;
        }
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
