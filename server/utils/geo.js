const db = require('../database/db');

// ISO 3166-1 alpha-2 country code -> continent name. Used to derive
// "Continent" for the admin Reports pivot from whatever country Nominatim
// resolves a pincode+city to (see resolveCountryContinent below) — there's
// no continent field anywhere in the data model, so this is the only source
// of truth for that row option.
const COUNTRY_TO_CONTINENT = {
  // Africa
  DZ: 'Africa', AO: 'Africa', BJ: 'Africa', BW: 'Africa', BF: 'Africa', BI: 'Africa', CV: 'Africa',
  CM: 'Africa', CF: 'Africa', TD: 'Africa', KM: 'Africa', CG: 'Africa', CD: 'Africa', CI: 'Africa',
  DJ: 'Africa', EG: 'Africa', GQ: 'Africa', ER: 'Africa', SZ: 'Africa', ET: 'Africa', GA: 'Africa',
  GM: 'Africa', GH: 'Africa', GN: 'Africa', GW: 'Africa', KE: 'Africa', LS: 'Africa', LR: 'Africa',
  LY: 'Africa', MG: 'Africa', MW: 'Africa', ML: 'Africa', MR: 'Africa', MU: 'Africa', YT: 'Africa',
  MA: 'Africa', MZ: 'Africa', NA: 'Africa', NE: 'Africa', NG: 'Africa', RE: 'Africa', RW: 'Africa',
  SH: 'Africa', ST: 'Africa', SN: 'Africa', SC: 'Africa', SL: 'Africa', SO: 'Africa', ZA: 'Africa',
  SS: 'Africa', SD: 'Africa', TZ: 'Africa', TG: 'Africa', TN: 'Africa', UG: 'Africa', EH: 'Africa',
  ZM: 'Africa', ZW: 'Africa',
  // Antarctica
  AQ: 'Antarctica', TF: 'Antarctica', GS: 'Antarctica', BV: 'Antarctica', HM: 'Antarctica',
  // Asia
  AF: 'Asia', AM: 'Asia', AZ: 'Asia', BH: 'Asia', BD: 'Asia', BT: 'Asia', BN: 'Asia', KH: 'Asia',
  CN: 'Asia', CY: 'Asia', GE: 'Asia', HK: 'Asia', IN: 'Asia', ID: 'Asia', IR: 'Asia', IQ: 'Asia',
  IL: 'Asia', JP: 'Asia', JO: 'Asia', KZ: 'Asia', KW: 'Asia', KG: 'Asia', LA: 'Asia', LB: 'Asia',
  MO: 'Asia', MY: 'Asia', MV: 'Asia', MN: 'Asia', MM: 'Asia', NP: 'Asia', KP: 'Asia', OM: 'Asia',
  PK: 'Asia', PS: 'Asia', PH: 'Asia', QA: 'Asia', SA: 'Asia', SG: 'Asia', KR: 'Asia', LK: 'Asia',
  SY: 'Asia', TW: 'Asia', TJ: 'Asia', TH: 'Asia', TL: 'Asia', TR: 'Asia', TM: 'Asia', AE: 'Asia',
  UZ: 'Asia', VN: 'Asia', YE: 'Asia',
  // Europe
  AL: 'Europe', AD: 'Europe', AT: 'Europe', BY: 'Europe', BE: 'Europe', BA: 'Europe', BG: 'Europe',
  HR: 'Europe', CZ: 'Europe', DK: 'Europe', EE: 'Europe', FO: 'Europe', FI: 'Europe', FR: 'Europe',
  DE: 'Europe', GI: 'Europe', GR: 'Europe', GG: 'Europe', VA: 'Europe', HU: 'Europe', IS: 'Europe',
  IE: 'Europe', IM: 'Europe', IT: 'Europe', JE: 'Europe', XK: 'Europe', LV: 'Europe', LI: 'Europe',
  LT: 'Europe', LU: 'Europe', MT: 'Europe', MD: 'Europe', MC: 'Europe', ME: 'Europe', NL: 'Europe',
  MK: 'Europe', NO: 'Europe', PL: 'Europe', PT: 'Europe', RO: 'Europe', RU: 'Europe', SM: 'Europe',
  RS: 'Europe', SK: 'Europe', SI: 'Europe', ES: 'Europe', SJ: 'Europe', SE: 'Europe', CH: 'Europe',
  UA: 'Europe', GB: 'Europe', AX: 'Europe',
  // North America
  AI: 'North America', AG: 'North America', AW: 'North America', BS: 'North America', BB: 'North America',
  BZ: 'North America', BM: 'North America', VG: 'North America', CA: 'North America', KY: 'North America',
  CR: 'North America', CU: 'North America', CW: 'North America', DM: 'North America', DO: 'North America',
  SV: 'North America', GL: 'North America', GD: 'North America', GP: 'North America', GT: 'North America',
  HT: 'North America', HN: 'North America', JM: 'North America', MQ: 'North America', MX: 'North America',
  MS: 'North America', NI: 'North America', PA: 'North America', PR: 'North America', BL: 'North America',
  KN: 'North America', LC: 'North America', MF: 'North America', PM: 'North America', VC: 'North America',
  SX: 'North America', TT: 'North America', TC: 'North America', US: 'North America', VI: 'North America',
  // Oceania
  AS: 'Oceania', AU: 'Oceania', CK: 'Oceania', FJ: 'Oceania', PF: 'Oceania', GU: 'Oceania',
  KI: 'Oceania', MH: 'Oceania', FM: 'Oceania', NR: 'Oceania', NC: 'Oceania', NZ: 'Oceania',
  NU: 'Oceania', NF: 'Oceania', MP: 'Oceania', PW: 'Oceania', PG: 'Oceania', PN: 'Oceania',
  WS: 'Oceania', SB: 'Oceania', TK: 'Oceania', TO: 'Oceania', TV: 'Oceania', VU: 'Oceania',
  WF: 'Oceania',
  // South America
  AR: 'South America', BO: 'South America', BR: 'South America', CL: 'South America', CO: 'South America',
  EC: 'South America', FK: 'South America', GF: 'South America', GY: 'South America', PY: 'South America',
  PE: 'South America', SR: 'South America', UY: 'South America', VE: 'South America',
};

const normCity = (city) => (city || '').trim();

// Same key shape used both for the pincode_geo_cache lookups below and for
// indexing resolveManyCountryContinent's return map — callers (reports.js)
// need to reproduce this exact key to read back a given pincode+city pair's
// result, hence exporting it.
const pairKey = (pincode, city) => `${pincode}::${normCity(city).toLowerCase()}`;

// Resolve a single (pincode, city) pair to { country, continent } — checks
// the pincode_geo_cache table first (see db.js's migration), and only calls
// out to Nominatim's free postcode-search API when nothing's cached yet.
// City is required alongside pincode: a pincode alone is ambiguous across
// countries (the same 4-5 digit code exists in unrelated countries), which
// previously produced wrong results — e.g. Zurich's 8007 or Munich's 81243
// resolving to the wrong country entirely. Passing both narrows Nominatim's
// match to the right place. Nominatim's usage policy caps free lookups at
// ~1/sec and requires an identifying User-Agent, so callers doing several of
// these in a row should use resolveManyCountryContinent instead, which
// paces the uncached ones.
async function resolveCountryContinent(pincode, city) {
  const normalizedCity = normCity(city);
  if (!pincode || !normalizedCity) return { country: null, continent: null };

  const cached = await db.query(
    'SELECT country, continent FROM pincode_geo_cache WHERE pincode = $1 AND city = $2',
    [pincode, normalizedCity]
  );
  if (cached.rows[0]) return { country: cached.rows[0].country, continent: cached.rows[0].continent };

  try {
    // accept-language=en pins the country name to a single English form —
    // without it Nominatim returns the name in the place's own local
    // language(s), which for officially multilingual countries (e.g.
    // Switzerland) comes back as all of them joined together
    // ("Schweiz/Suisse/Svizzera/Svizra") instead of one clean label.
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(pincode)}&city=${encodeURIComponent(normalizedCity)}&format=jsonv2&addressdetails=1&limit=1&accept-language=en`,
      { headers: { 'User-Agent': 'REMAR-Schweiz-App/1.0 (admin reports pincode+city lookup)' } }
    );
    const data = await res.json();
    const addr = data?.[0]?.address;
    const countryCode = addr?.country_code ? addr.country_code.toUpperCase() : null;
    const country = addr?.country || null;
    const continent = countryCode ? (COUNTRY_TO_CONTINENT[countryCode] || null) : null;

    await db.query(
      `INSERT INTO pincode_geo_cache (pincode, city, country, continent) VALUES ($1, $2, $3, $4)
       ON CONFLICT (pincode, city) DO UPDATE SET country = $3, continent = $4, resolved_at = NOW()`,
      [pincode, normalizedCity, country, continent]
    );
    return { country, continent };
  } catch (err) {
    return { country: null, continent: null };
  }
}

// Batch version — resolves every distinct (pincode, city) pair in the list,
// reusing the cache table for anything already known and pacing fresh
// Nominatim lookups a little over 1/sec apart (only for actual cache
// misses). Pairs missing either field are skipped — without a city there's
// nothing to disambiguate a pincode with, so that entry is just left out of
// the result rather than risk another wrong-country guess. Returns
// { [pairKey(pincode, city)]: { country, continent } }.
async function resolveManyCountryContinent(pairs) {
  const unique = new Map();
  for (const p of pairs) {
    const pincode = p?.pincode;
    const city = normCity(p?.city);
    if (!pincode || !city) continue;
    const key = pairKey(pincode, city);
    if (!unique.has(key)) unique.set(key, { pincode, city });
  }

  const map = {};
  for (const [key, { pincode, city }] of unique) {
    const cached = await db.query(
      'SELECT country, continent FROM pincode_geo_cache WHERE pincode = $1 AND city = $2',
      [pincode, city]
    );
    if (cached.rows[0]) {
      map[key] = { country: cached.rows[0].country, continent: cached.rows[0].continent };
      continue;
    }
    map[key] = await resolveCountryContinent(pincode, city);
    await new Promise(r => setTimeout(r, 1100));
  }
  return map;
}

module.exports = { resolveCountryContinent, resolveManyCountryContinent, pairKey, COUNTRY_TO_CONTINENT };
