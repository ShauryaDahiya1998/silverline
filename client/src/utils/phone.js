// Shared by the phone number ISD-code box on Registration and Edit Profile
// (both roles) — turns whatever someone types into a proper "+<code>"
// international format, regardless of which convention they typed it in:
//   49    -> +49
//   0049  -> +49   (the "00" international exit-code convention)
//   001   -> +1
//   0234  -> +234
// Strategy: keep only digits, drop every leading zero (there's no valid ISD
// code that itself starts with 0), then cap at 4 digits and prepend '+'.
// Always re-derived from scratch on every keystroke, so it's safe to feed
// this function its own previous output (e.g. "+49" + typing "9") without
// ever producing a double '+' or leftover zeros.
export function formatIsdCode(raw) {
  const digits = (raw || '').replace(/\D/g, '').replace(/^0+/, '').slice(0, 4);
  return digits ? `+${digits}` : '';
}
