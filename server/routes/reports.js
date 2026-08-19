const express = require('express');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { resolveManyCountryContinent, pairKey } = require('../utils/geo');
const router = express.Router();

const ROW_KEYS = ['category', 'sub_category', 'item', 'all_beneficiaries', 'all_helpers', 'id', 'pincode', 'city', 'country', 'continent'];
const COLUMN_KEYS = ['tat', 'value', 'hours', 'donation', 'helps'];

// Row options whose grouping key comes off the help item itself, not either
// party — donations (which aren't tied to any specific help item) have no
// meaningful value for these, and get a "note" response instead of a table.
const ITEM_ROW_KEYS = new Set(['category', 'sub_category', 'item']);

const helperLabel = (memberNumber, name) => `${memberNumber || '—'}${name ? ` · ${name}` : ''}`;

// One label per completed assignment for a given row dimension — most
// dimensions return exactly one label; "id" (Member ID) and the location
// dimensions (pincode/city/country/continent) return up to two, since a
// single completed match always touches one helper AND one beneficiary and
// both sides' involvement/location should count. (If both sides happen to
// share the same city/pincode, that match is counted twice under the same
// label — an accepted simplification for this report.)
function rowLabelsForAssignment(r, rowKey, geoByKey) {
  switch (rowKey) {
    case 'category': return [r.category || 'Uncategorized'];
    case 'sub_category': return [r.sub_category || 'Uncategorized'];
    case 'item': return [r.title || 'Untitled'];
    case 'all_helpers': return [helperLabel(r.helper_member_number, r.helper_name)];
    case 'all_beneficiaries': return [helperLabel(r.beneficiary_member_number, r.beneficiary_name)];
    case 'id': return [helperLabel(r.helper_member_number, r.helper_name), helperLabel(r.beneficiary_member_number, r.beneficiary_name)];
    case 'pincode': return [r.helper_pincode, r.beneficiary_pincode].filter(Boolean);
    case 'city': return [r.helper_city, r.beneficiary_city].filter(Boolean);
    case 'country': return [
      geoByKey[pairKey(r.helper_pincode, r.helper_city)]?.country,
      geoByKey[pairKey(r.beneficiary_pincode, r.beneficiary_city)]?.country,
    ].filter(Boolean);
    case 'continent': return [
      geoByKey[pairKey(r.helper_pincode, r.helper_city)]?.continent,
      geoByKey[pairKey(r.beneficiary_pincode, r.beneficiary_city)]?.continent,
    ].filter(Boolean);
    default: return [];
  }
}

// Same idea for donations — these only ever have a helper side (donations
// are money a helper gives to REMAR directly, unrelated to any help item or
// beneficiary), so "all_beneficiaries" and the item dimensions never apply.
function rowLabelsForDonation(r, rowKey, geoByKey) {
  switch (rowKey) {
    case 'all_helpers':
    case 'id':
      return [helperLabel(r.member_number, r.name)];
    case 'pincode': return r.pincode ? [r.pincode] : [];
    case 'city': return r.city ? [r.city] : [];
    case 'country': {
      const g = geoByKey[pairKey(r.pincode, r.city)];
      return g?.country ? [g.country] : [];
    }
    case 'continent': {
      const g = geoByKey[pairKey(r.pincode, r.city)];
      return g?.continent ? [g.continent] : [];
    }
    default: return [];
  }
}

// currency is the requesting admin's own Settings > App preferences choice
// (Fr/€/$ — a label swap only, no FX conversion) rather than a fixed string,
// so the pivot's money columns match whatever this admin has selected.
const fmtFor = (currency) => ({
  tat: (v) => `${v.toFixed(1)} h`,
  value: (v) => `${currency} ${v.toFixed(2)}`,
  hours: (v) => `${v.toFixed(1)} h`,
  donation: (v) => `${currency} ${v.toFixed(2)}`,
  helps: (v) => `${Math.round(v)}`,
});

// Admin-only pivot for Reports: pick a row dimension (who/what to group by)
// and a column metric (what to measure), get back one grouped table. Reached
// from Admin Home > Services > Reports.
router.get('/pivot', authenticate, requireRole('admin'), async (req, res) => {
  const rowKey = String(req.query.row || '');
  const columnKey = String(req.query.column || '');
  if (!ROW_KEYS.includes(rowKey)) return res.status(400).json({ error: `row must be one of: ${ROW_KEYS.join(', ')}` });
  if (!COLUMN_KEYS.includes(columnKey)) return res.status(400).json({ error: `column must be one of: ${COLUMN_KEYS.join(', ')}` });

  try {
    const currencyResult = await db.query('SELECT currency FROM users WHERE id = $1', [req.user.id]);
    const fmt = fmtFor(currencyResult.rows[0]?.currency || 'Fr');

    if (columnKey === 'donation') {
      if (ITEM_ROW_KEYS.has(rowKey)) {
        return res.json({ rows: [], note: "Donations aren't tied to a help item, so they can't be broken down by category, sub-category, or item." });
      }
      if (rowKey === 'all_beneficiaries') {
        return res.json({ rows: [], note: 'Donations are money helpers give to REMAR directly — beneficiaries never appear here.' });
      }

      const donationRows = (await db.query(
        `SELECT d.amount, hv.member_number, hv.name, hv.city, hv.pincode
         FROM donations d JOIN helpers hv ON hv.id = d.helper_id`
      )).rows;

      let geoByKey = {};
      if (rowKey === 'country' || rowKey === 'continent') {
        geoByKey = await resolveManyCountryContinent(donationRows.map(r => ({ pincode: r.pincode, city: r.city })));
      }

      const totals = new Map();
      for (const r of donationRows) {
        for (const label of rowLabelsForDonation(r, rowKey, geoByKey)) {
          totals.set(label, (totals.get(label) || 0) + (Number(r.amount) || 0));
        }
      }
      const out = [...totals.entries()]
        .map(([label, sum]) => ({ label, value: fmt.donation(sum), raw: sum }))
        .sort((a, b) => b.raw - a.raw);
      return res.json({ rows: out, note: null });
    }

    // Every other column (tat/value/hours/helps) is scoped to completed
    // assignments — see the module comment on the endpoint's meaning of
    // "completed": an assignment whose status is 'completed'.
    const assignmentRows = (await db.query(
      `SELECT a.updated_at AS completed_at,
              h.category, h.sub_category, h.title, h.value, h.duration_hours, h.created_at AS help_created_at,
              hv.member_number AS helper_member_number, hv.name AS helper_name, hv.city AS helper_city, hv.pincode AS helper_pincode,
              bv.member_number AS beneficiary_member_number, bv.name AS beneficiary_name, bv.city AS beneficiary_city, bv.pincode AS beneficiary_pincode
       FROM assignments a
       JOIN helps h ON h.id = a.help_row_id
       JOIN helpers hv ON hv.id = a.volunteer_id
       JOIN beneficiaries bv ON bv.id = a.beneficiary_id
       WHERE a.status = 'completed'`
    )).rows;

    let geoByKey = {};
    if (rowKey === 'country' || rowKey === 'continent') {
      const allPairs = assignmentRows.flatMap(r => [
        { pincode: r.helper_pincode, city: r.helper_city },
        { pincode: r.beneficiary_pincode, city: r.beneficiary_city },
      ]);
      geoByKey = await resolveManyCountryContinent(allPairs);
    }

    const sums = new Map();      // label -> running total (value/hours/tat-hours sum)
    const counts = new Map();    // label -> number of assignments contributing (for helps count / labels seen)
    const tatCounts = new Map(); // label -> number of assignments with a valid TAT (for the average)

    for (const r of assignmentRows) {
      const value = Number(r.value) || 0;
      const hours = Number(r.duration_hours) || 0;
      const tatHours = r.help_created_at && r.completed_at
        ? (new Date(r.completed_at) - new Date(r.help_created_at)) / 3600000
        : null;

      for (const label of rowLabelsForAssignment(r, rowKey, geoByKey)) {
        counts.set(label, (counts.get(label) || 0) + 1);
        if (columnKey === 'value') sums.set(label, (sums.get(label) || 0) + value);
        else if (columnKey === 'hours') sums.set(label, (sums.get(label) || 0) + hours);
        else if (columnKey === 'helps') sums.set(label, (sums.get(label) || 0) + 1);
        else if (columnKey === 'tat' && tatHours != null) {
          sums.set(label, (sums.get(label) || 0) + tatHours);
          tatCounts.set(label, (tatCounts.get(label) || 0) + 1);
        }
      }
    }

    const out = [...counts.keys()].map(label => {
      const raw = columnKey === 'tat'
        ? (tatCounts.get(label) ? (sums.get(label) || 0) / tatCounts.get(label) : 0)
        : (sums.get(label) || 0);
      return { label, value: fmt[columnKey](raw), raw };
    }).sort((a, b) => b.raw - a.raw);

    res.json({ rows: out, note: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Site-wide summary tiles for the top of Admin Reports — the same headline
// metrics as a helper's My Contribution page (Helps/On-time/Value/Hours/
// Donations — see Contribution.jsx), plus TAT, aggregated across every
// completed assignment and every donation platform-wide rather than scoped
// to one person. Helpers/Beneficiaries counts are already fetched by the
// client from their own list endpoints, so aren't duplicated here.
router.get('/summary', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const currencyResult = await db.query('SELECT currency FROM users WHERE id = $1', [req.user.id]);
    const currency = currencyResult.rows[0]?.currency || 'Fr';

    const [donationsResult, assignmentsResult] = await Promise.all([
      db.query('SELECT COALESCE(SUM(amount), 0) AS total FROM donations'),
      db.query(
        `SELECT h.value, h.duration_hours, a.on_time, a.updated_at AS completed_at, h.created_at AS help_created_at
         FROM assignments a JOIN helps h ON h.id = a.help_row_id
         WHERE a.status = 'completed'`
      ),
    ]);

    const rows = assignmentsResult.rows;
    const totalValue = rows.reduce((sum, r) => sum + (Number(r.value) || 0), 0);
    const totalHours = rows.reduce((sum, r) => sum + (Number(r.duration_hours) || 0), 0);
    const onTimeRated = rows.filter(r => r.on_time !== null && r.on_time !== undefined);
    const onTimePct = onTimeRated.length ? Math.round((onTimeRated.filter(r => r.on_time === true).length / onTimeRated.length) * 100) : null;
    const tatRows = rows.filter(r => r.help_created_at && r.completed_at);
    const avgTatHours = tatRows.length
      ? tatRows.reduce((sum, r) => sum + (new Date(r.completed_at) - new Date(r.help_created_at)) / 3600000, 0) / tatRows.length
      : null;

    res.json({
      donations: Number(donationsResult.rows[0].total) || 0,
      value: totalValue,
      hours: totalHours,
      helps: rows.length,
      tatHours: avgTatHours,
      onTimePct,
      currency,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
