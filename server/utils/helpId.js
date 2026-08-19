// Server-side port of client/src/utils/helpStatus.js's formatHelpId — X +
// a role letter (H for a helper's own item, B for a beneficiary's) + a
// 2-letter block + a 4-digit counter (XHAA0001, XHAA0002 ... XHAA9999,
// XHAB0001, ...; separately XBAA0001, XBAA0002, ... for beneficiaries).
// Two independent sequences (one per role) so a helper's and a
// beneficiary's IDs never collide and each stays gapless within its own
// role. Generated once, server-side, at creation time and stored on the
// row, so it's a real permanent identifier. sequence is 1-based, counted
// only among helps created by that same role.
function formatHelpId(prefix, sequence) {
const letterIndex = Math.floor((sequence - 1) / 9999);
const withinBlock = ((sequence - 1) % 9999) + 1;
const c1 = String.fromCharCode(65 + (Math.floor(letterIndex / 26) % 26));
const c2 = String.fromCharCode(65 + (letterIndex % 26));
return `X${prefix}${c1}${c2}${String(withinBlock).padStart(4, '0')}`;
}

// S = a Remar Store item admin created directly for themselves (not on
// behalf of a specific helper/beneficiary) — see helps.direction/POST /help.
const HELP_ID_RE = /^X[BHS][A-Z]{2}\d{4}$/;

// Inverse of formatHelpId — turns e.g. "XHAB0007" back into its 1-based
// sequence number. Used to derive the next id from the highest existing one
// (MAX-based, same approach as parseMemberNumberSequence) rather than
// COUNT(*), which silently collides with an existing higher id as soon as
// any row in between has been deleted (e.g. test-data cleanup) — COUNT
// undercounts the true sequence position whenever there's a gap.
function parseHelpIdSequence(helpId) {
const m = /^X[BHS]([A-Z])([A-Z])(\d{4})$/.exec(helpId);
if (!m) return 0;
const letterIndex = (m[1].charCodeAt(0) - 65) * 26 + (m[2].charCodeAt(0) - 65);
return letterIndex * 9999 + parseInt(m[3], 10);
}

module.exports = { formatHelpId, parseHelpIdSequence, HELP_ID_RE };
