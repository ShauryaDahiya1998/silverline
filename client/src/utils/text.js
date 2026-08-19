// Shared by HelperRegister.jsx and EditHelperProfile.jsx's "Describe
// professional experience" textarea (shown once 'Professional services' is
// selected) — keeps the entry under 100 words rather than a character
// count, since a free-text experience summary is naturally measured in
// words. Simple truncate-on-exceed: typing normally is untouched right up
// to the 99th word; the 100th word gets dropped rather than accepted and
// then trimmed, which would feel like the field silently ate what was just
// typed.
export function capWordsUnder100(text) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 99) return text;
  return words.slice(0, 99).join(' ');
}
