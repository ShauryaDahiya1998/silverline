// Shared member-ID format used for both helpers and beneficiaries:
// prefix (H/B) + a 2-letter block + a 4-digit counter, e.g. HAA0001, HAA0002
// ... HAA9999, HAB0001, ... The letter block only advances once the current
// one fills up (9999 members), so the scheme scales to 676 blocks x 9999 =
// ~6.76M members per role without ever needing to change format again.
function formatMemberNumber(prefix, sequence) {
  const letterIndex = Math.floor((sequence - 1) / 9999);
  const withinBlock = ((sequence - 1) % 9999) + 1;
  const first = String.fromCharCode(65 + Math.floor(letterIndex / 26));
  const second = String.fromCharCode(65 + (letterIndex % 26));
  return `${prefix}${first}${second}${String(withinBlock).padStart(4, '0')}`;
}

// Matches the new format only — used to detect legacy "H-0004"-style values
// that still need reformatting.
const MEMBER_NUMBER_RE = /^[A-Z]{3}\d{4}$/;

// Inverse of formatMemberNumber — turns e.g. "HAB0004" back into its 1-based
// sequence number. Used so the next member number can be derived from the
// highest one that currently exists (MAX) rather than a row COUNT, which
// drifts — and can hand out a number that's already taken — the moment any
// volunteer/beneficiary row has ever been deleted.
function parseMemberNumberSequence(memberNumber) {
  const first = memberNumber.charCodeAt(1) - 65;
  const second = memberNumber.charCodeAt(2) - 65;
  const withinBlock = parseInt(memberNumber.slice(3), 10);
  return first * 26 * 9999 + second * 9999 + withinBlock;
}

module.exports = { formatMemberNumber, parseMemberNumberSequence, MEMBER_NUMBER_RE };
